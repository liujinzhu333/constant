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
        // 后续版本迁移在此追加 ALTER TABLE 语句
    }

    override fun onConfigure(db: SQLiteDatabase) {
        super.onConfigure(db)
        db.setForeignKeyConstraintsEnabled(true)
    }

    companion object {
        const val DB_NAME    = "dream.db"
        const val DB_VERSION = 1

        val DDL = listOf(
            """CREATE TABLE IF NOT EXISTS todos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                note TEXT DEFAULT '',
                priority TEXT DEFAULT 'medium',
                status TEXT DEFAULT 'pending',
                due_at INTEGER,
                remind_at INTEGER,
                tags TEXT DEFAULT '[]',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS study_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                category TEXT DEFAULT 'study',
                status TEXT DEFAULT 'active',
                parent_id INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS study_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(plan_id) REFERENCES study_plans(id) ON DELETE CASCADE
            )""",
            """CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT DEFAULT '',
                is_pinned INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                date TEXT NOT NULL,
                start_time TEXT DEFAULT '',
                end_time TEXT DEFAULT '',
                is_all_day INTEGER DEFAULT 0,
                color TEXT DEFAULT '#0071e3',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS reminders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                remind_at INTEGER NOT NULL,
                status TEXT DEFAULT 'pending',
                source_type TEXT DEFAULT '',
                source_id INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform TEXT NOT NULL,
                type TEXT DEFAULT 'other',
                username TEXT DEFAULT '',
                email TEXT DEFAULT '',
                phone TEXT DEFAULT '',
                password_encrypted TEXT DEFAULT '',
                url TEXT DEFAULT '',
                note TEXT DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT DEFAULT 'link',
                title TEXT NOT NULL,
                url TEXT DEFAULT '',
                content TEXT DEFAULT '',
                author TEXT DEFAULT '',
                source TEXT DEFAULT '',
                tags TEXT DEFAULT '[]',
                is_pinned INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )"""
        )
    }
}
