package com.dream.mobile.db

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.dream.mobile.bridge.BaseBridge
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject

/**
 * SQLiteBridge — 原生 SQLite 能力暴露给 H5
 *
 * H5 调用示例：
 * ```js
 * // 执行 DDL / DML（INSERT / UPDATE / DELETE）
 * bridge.call('sqlite', 'exec', { sql: 'INSERT INTO ...', args: [...] })
 *
 * // 查询（SELECT）
 * bridge.call('sqlite', 'query', { sql: 'SELECT ...', args: [...] })
 * // → data: [ { id: 1, title: '...' }, ... ]
 *
 * // 获取最后插入 rowid
 * bridge.call('sqlite', 'lastInsertId', {})
 * // → data: { id: 42 }
 * ```
 */
class SQLiteBridge(
    private val context: Context,
    callback: (id: String, ok: Boolean, data: Any?, error: String) -> Unit
) : BaseBridge(callback) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val helper = DreamDBHelper(context)

    // 记录最后一次 exec 插入的 rowid，供 lastInsertId() 使用
    @Volatile private var lastRowId: Long = 0L

    override fun handle(id: String, method: String, params: JSONObject) {
        scope.launch {
            try {
                when (method) {
                    "init"          -> init(id)
                    "exec"          -> exec(id, params)
                    "query"         -> query(id, params)
                    "lastInsertId"  -> lastInsertId(id)
                    "transaction"   -> transaction(id, params)
                    else            -> fail(id, "Unknown sqlite method: $method")
                }
            } catch (e: Exception) {
                fail(id, e.message ?: "SQLite error")
            }
        }
    }

    /**
     * init — H5 启动时调用，触发 SQLiteOpenHelper.onCreate 完成建表。
     * 无需额外操作，getWritableDatabase() 会自动执行 DDL。
     */
    private fun init(id: String) {
        // 触发 onCreate / onUpgrade
        helper.writableDatabase
        ok(id, JSONObject().put("ok", true))
    }

    private fun exec(id: String, params: JSONObject) {
        val sql  = params.getString("sql")
        val args = params.optJSONArray("args")?.toBindArray() ?: emptyArray()
        val db = helper.writableDatabase
        db.execSQL(sql, args)
        // 获取 last_insert_rowid，INSERT 时有效；UPDATE/DELETE 返回 0
        val cursor = db.rawQuery("SELECT last_insert_rowid()", null)
        val rowId = cursor.use {
            if (it.moveToFirst()) it.getLong(0) else 0L
        }
        if (rowId > 0L) lastRowId = rowId
        ok(id, JSONObject().put("changes", 1).put("lastInsertId", rowId))
    }

    private fun query(id: String, params: JSONObject) {
        val sql  = params.getString("sql")
        val args = params.optJSONArray("args")?.toStringArray() ?: emptyArray()
        val db = helper.readableDatabase
        val cursor = db.rawQuery(sql, args)
        val rows = JSONArray()
        cursor.use {
            val cols = it.columnNames
            while (it.moveToNext()) {
                val row = JSONObject()
                cols.forEachIndexed { i, col ->
                    when (it.getType(i)) {
                        android.database.Cursor.FIELD_TYPE_INTEGER -> row.put(col, it.getLong(i))
                        android.database.Cursor.FIELD_TYPE_FLOAT   -> row.put(col, it.getDouble(i))
                        android.database.Cursor.FIELD_TYPE_NULL    -> row.put(col, JSONObject.NULL)
                        else                                        -> row.put(col, it.getString(i))
                    }
                }
                rows.put(row)
            }
        }
        // H5 端 db.query() 期望 { rows: [...] } 格式
        ok(id, JSONObject().put("rows", rows))
    }

    private fun lastInsertId(id: String) {
        ok(id, JSONObject().put("id", lastRowId))
    }

    private fun transaction(id: String, params: JSONObject) {
        val statements = params.getJSONArray("statements")
        val db = helper.writableDatabase
        db.beginTransaction()
        try {
            for (i in 0 until statements.length()) {
                val stmt = statements.getJSONObject(i)
                val sql  = stmt.getString("sql")
                val args = stmt.optJSONArray("args")?.toBindArray() ?: emptyArray()
                db.execSQL(sql, args)
            }
            db.setTransactionSuccessful()
            ok(id, JSONObject().put("committed", true))
        } finally {
            db.endTransaction()
        }
    }

    override fun destroy() {
        scope.cancel()
        helper.close()
    }

    // ---- Helper ----

    /**
     * 用于 rawQuery 的 String 数组（WHERE 条件参数），null 转 "null" 字符串
     */
    private fun JSONArray.toStringArray(): Array<String> =
        Array(length()) { i ->
            if (isNull(i)) "null" else optString(i)
        }

    /**
     * 用于 execSQL 的 Any? 数组，保留 JSON null → Kotlin null，
     * 使 SQLite 正确存储 NULL 而不是空字符串
     */
    private fun JSONArray.toBindArray(): Array<Any?> =
        Array(length()) { i ->
            when {
                isNull(i) -> null
                else -> {
                    // 尝试以数字类型绑定，避免数字被存为文本
                    val v = get(i)
                    when (v) {
                        is Int    -> v.toLong()
                        is Long   -> v
                        is Double -> v
                        is Float  -> v.toDouble()
                        else      -> v.toString()
                    }
                }
            }
        }
}

/**
 * 数据库版本管理，表结构与 PC 端 / H5 端完全一致。
 */
class DreamDBHelper(context: Context) :
    SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {

    override fun onCreate(db: SQLiteDatabase) {
        DDL.forEach { db.execSQL(it) }
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) {
            // ---- todos ----
            // priority: TEXT('medium') → INTEGER(2)，status: 'pending'→'todo'
            db.execSQL("ALTER TABLE todos ADD COLUMN done_at INTEGER")
            db.execSQL("UPDATE todos SET status = 'todo' WHERE status = 'pending'")
            db.execSQL("UPDATE todos SET status = 'done' WHERE status = 'done'") // 保持不变
            // priority 列类型无法直接改，用重建表方式迁移
            db.execSQL("""
                CREATE TABLE todos_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
                    note TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'todo',
                    priority INTEGER NOT NULL DEFAULT 2, due_at INTEGER, remind_at INTEGER,
                    tags TEXT DEFAULT '[]', created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL, done_at INTEGER
                )
            """.trimIndent())
            db.execSQL("""
                INSERT INTO todos_new (id,title,note,status,priority,due_at,remind_at,tags,created_at,updated_at,done_at)
                SELECT id, title, note,
                    CASE status WHEN 'pending' THEN 'todo' ELSE status END,
                    CASE priority WHEN 'high' THEN 1 WHEN 'low' THEN 3 ELSE 2 END,
                    due_at, remind_at, tags, created_at, updated_at, NULL
                FROM todos
            """.trimIndent())
            db.execSQL("DROP TABLE todos")
            db.execSQL("ALTER TABLE todos_new RENAME TO todos")

            // ---- study_plans ----
            db.execSQL("ALTER TABLE study_plans ADD COLUMN goal TEXT DEFAULT ''")
            db.execSQL("ALTER TABLE study_plans ADD COLUMN start_date INTEGER")
            db.execSQL("ALTER TABLE study_plans ADD COLUMN end_date INTEGER")
            db.execSQL("ALTER TABLE study_plans ADD COLUMN progress INTEGER DEFAULT 0")
            db.execSQL("ALTER TABLE study_plans ADD COLUMN color TEXT DEFAULT '#0071e3'")

            // ---- study_tasks ----
            db.execSQL("ALTER TABLE study_tasks ADD COLUMN due_at INTEGER")
            db.execSQL("ALTER TABLE study_tasks ADD COLUMN sort_order INTEGER DEFAULT 0")
            db.execSQL("UPDATE study_tasks SET status = 'todo' WHERE status = 'pending'")

            // ---- notes ----
            db.execSQL("ALTER TABLE notes ADD COLUMN tags TEXT DEFAULT '[]'")

            // ---- schedules: 结构差异大，重建 ----
            db.execSQL("""
                CREATE TABLE schedules_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
                    note TEXT DEFAULT '', start_at INTEGER NOT NULL, end_at INTEGER NOT NULL,
                    all_day INTEGER DEFAULT 0, color TEXT DEFAULT '#0071e3',
                    remind_at INTEGER, repeat_rule TEXT DEFAULT '',
                    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
                )
            """.trimIndent())
            // 旧数据：date+start_time+end_time → start_at/end_at（秒级时间戳 → ms）
            db.execSQL("""
                INSERT INTO schedules_new (id,title,note,start_at,end_at,all_day,color,remind_at,repeat_rule,created_at,updated_at)
                SELECT id, title,
                    COALESCE(description, ''),
                    strftime('%s', date || CASE WHEN is_all_day=0 AND start_time!='' THEN ' '||start_time ELSE ' 00:00' END)*1000,
                    strftime('%s', date || CASE WHEN is_all_day=0 AND end_time!='' THEN ' '||end_time ELSE ' 23:59' END)*1000,
                    is_all_day,
                    COALESCE(color, '#0071e3'),
                    NULL, '',
                    created_at, updated_at
                FROM schedules
            """.trimIndent())
            db.execSQL("DROP TABLE schedules")
            db.execSQL("ALTER TABLE schedules_new RENAME TO schedules")

            // ---- reminders: description→body，去掉 updated_at ----
            db.execSQL("""
                CREATE TABLE reminders_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_type TEXT NOT NULL DEFAULT 'custom', source_id INTEGER,
                    title TEXT NOT NULL, body TEXT DEFAULT '',
                    remind_at INTEGER NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    created_at INTEGER NOT NULL
                )
            """.trimIndent())
            db.execSQL("""
                INSERT INTO reminders_new (id,source_type,source_id,title,body,remind_at,status,created_at)
                SELECT id,
                    CASE WHEN source_type='' OR source_type IS NULL THEN 'custom' ELSE source_type END,
                    source_id, title,
                    COALESCE(description,''),
                    remind_at, status, created_at
                FROM reminders
            """.trimIndent())
            db.execSQL("DROP TABLE reminders")
            db.execSQL("ALTER TABLE reminders_new RENAME TO reminders")

            // ---- accounts: 字段全部重命名 ----
            db.execSQL("""
                CREATE TABLE accounts_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    platform TEXT NOT NULL DEFAULT '',
                    platform_url TEXT NOT NULL DEFAULT '',
                    account_name TEXT NOT NULL DEFAULT '',
                    phone TEXT NOT NULL DEFAULT '',
                    email TEXT NOT NULL DEFAULT '',
                    password_enc TEXT NOT NULL DEFAULT '',
                    note TEXT NOT NULL DEFAULT '',
                    category TEXT NOT NULL DEFAULT 'other',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                )
            """.trimIndent())
            db.execSQL("""
                INSERT INTO accounts_new (id,platform,platform_url,account_name,phone,email,password_enc,note,category,created_at,updated_at)
                SELECT id, platform, COALESCE(url,''), COALESCE(username,''),
                    COALESCE(phone,''), COALESCE(email,''),
                    COALESCE(password_encrypted,''), COALESCE(note,''),
                    COALESCE(type,'other'),
                    created_at, updated_at
                FROM accounts
            """.trimIndent())
            db.execSQL("DROP TABLE accounts")
            db.execSQL("ALTER TABLE accounts_new RENAME TO accounts")

            // ---- favorites: 去掉 source 列 ----
            db.execSQL("""
                CREATE TABLE favorites_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type TEXT NOT NULL DEFAULT 'link',
                    title TEXT NOT NULL DEFAULT '',
                    url TEXT NOT NULL DEFAULT '',
                    content TEXT NOT NULL DEFAULT '',
                    author TEXT NOT NULL DEFAULT '',
                    tags TEXT NOT NULL DEFAULT '[]',
                    is_pinned INTEGER NOT NULL DEFAULT 0,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                )
            """.trimIndent())
            db.execSQL("""
                INSERT INTO favorites_new (id,type,title,url,content,author,tags,is_pinned,created_at,updated_at)
                SELECT id,type,title,url,content,author,tags,is_pinned,created_at,updated_at
                FROM favorites
            """.trimIndent())
            db.execSQL("DROP TABLE favorites")
            db.execSQL("ALTER TABLE favorites_new RENAME TO favorites")
        }
    }

    override fun onConfigure(db: SQLiteDatabase) {
        super.onConfigure(db)
        db.setForeignKeyConstraintsEnabled(true)
    }

    companion object {
        const val DB_NAME    = "dream.db"
        const val DB_VERSION = 2  // v2: 对齐 PC 端 Schema（字段名/类型/新字段）

        val DDL = listOf(
            """CREATE TABLE IF NOT EXISTS todos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                note TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'todo',
                priority INTEGER NOT NULL DEFAULT 2,
                due_at INTEGER,
                remind_at INTEGER,
                tags TEXT DEFAULT '[]',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                done_at INTEGER
            )""",
            """CREATE TABLE IF NOT EXISTS study_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                goal TEXT DEFAULT '',
                category TEXT NOT NULL DEFAULT 'study',
                status TEXT NOT NULL DEFAULT 'active',
                start_date INTEGER,
                end_date INTEGER,
                progress INTEGER DEFAULT 0,
                color TEXT DEFAULT '#0071e3',
                parent_id INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS study_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'todo',
                due_at INTEGER,
                sort_order INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(plan_id) REFERENCES study_plans(id) ON DELETE CASCADE
            )""",
            """CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL DEFAULT '无标题',
                content TEXT DEFAULT '',
                tags TEXT DEFAULT '[]',
                is_pinned INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                note TEXT DEFAULT '',
                start_at INTEGER NOT NULL,
                end_at INTEGER NOT NULL,
                all_day INTEGER DEFAULT 0,
                color TEXT DEFAULT '#0071e3',
                remind_at INTEGER,
                repeat_rule TEXT DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS reminders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_type TEXT NOT NULL DEFAULT 'custom',
                source_id INTEGER,
                title TEXT NOT NULL,
                body TEXT DEFAULT '',
                remind_at INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at INTEGER NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform TEXT NOT NULL DEFAULT '',
                platform_url TEXT NOT NULL DEFAULT '',
                account_name TEXT NOT NULL DEFAULT '',
                phone TEXT NOT NULL DEFAULT '',
                email TEXT NOT NULL DEFAULT '',
                password_enc TEXT NOT NULL DEFAULT '',
                note TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT 'other',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL DEFAULT 'link',
                title TEXT NOT NULL DEFAULT '',
                url TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                author TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '[]',
                is_pinned INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )"""
        )
    }
}
