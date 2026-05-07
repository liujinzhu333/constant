<template>
  <div class="favorite-page">
    <van-nav-bar title="收藏" />

    <van-tabs v-model:active="activeTab" color="#0071e3" title-active-color="#0071e3" @change="onTypeChange">
      <van-tab v-for="t in typeTabs" :key="t.value" :title="t.label" :name="t.value" />
    </van-tabs>

    <van-search
      v-model="store.searchKeyword"
      placeholder="搜索收藏..."
      @update:model-value="onSearch"
    />

    <div class="list-wrap">
      <van-loading v-if="store.loading" class="loading-center" />
      <van-empty v-else-if="store.filteredFavorites.length === 0" description="暂无收藏" />

      <van-pull-refresh v-else v-model="refreshing" @refresh="onRefresh">
        <div class="list-inner">
          <div
            v-for="item in store.filteredFavorites"
            :key="item.id"
            class="fav-card"
            :class="item.type"
          >
            <!-- 链接 -->
            <template v-if="item.type === 'link'">
              <div class="fav-header">
                <span class="fav-title">{{ item.title }}</span>
                <div class="fav-header-right">
                  <van-icon v-if="item.is_pinned" name="top" color="#0071e3" />
                  <van-icon name="ellipsis" size="18" color="#aeaeb2" @click.stop="showItemActions(item)" />
                </div>
              </div>
              <span class="fav-url van-ellipsis" @click="openUrl(item.url)">{{ item.url }}</span>
              <div v-if="item.tags" class="tag-list">
                <van-tag v-for="tag in parseTags(item.tags)" :key="tag" plain type="primary" size="mini">{{ tag }}</van-tag>
              </div>
            </template>

            <!-- 名言 -->
            <template v-else>
              <div class="quote-bar"></div>
              <div class="quote-body">
                <p class="quote-text">{{ item.content }}</p>
                <div class="quote-footer">
                  <span class="quote-author">— {{ item.author || '佚名' }}</span>
                  <div class="fav-header-right">
                    <van-icon v-if="item.is_pinned" name="top" color="#0071e3" />
                    <van-icon name="ellipsis" size="18" color="#aeaeb2" @click.stop="showItemActions(item)" />
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </van-pull-refresh>
    </div>

    <div class="fab" @click="showAddDialog">
      <van-icon name="plus" color="#fff" size="24" />
    </div>

    <!-- 新增弹窗 -->
    <BottomSheet :visible="showSheet" @close="closePopup">
      <div class="sheet-inner">
        <van-nav-bar title="添加收藏" left-text="取消" right-text="保存" @click-left="closePopup" @click-right="submitAdd" />
        <div class="form-wrap">
          <van-cell-group inset>
            <van-cell title="类型">
              <template #right-icon>
                <van-radio-group v-model="form.type" direction="horizontal">
                  <van-radio name="link">🔗 链接</van-radio>
                  <van-radio name="quote">💬 名言</van-radio>
                </van-radio-group>
              </template>
            </van-cell>
          </van-cell-group>

          <van-cell-group v-if="form.type === 'link'" inset style="margin-top:12px">
            <van-field v-model="form.title" label="标题" placeholder="网页标题" maxlength="200" />
            <van-field v-model="form.url" label="URL" placeholder="https://..." maxlength="1000" @blur="extractTitle" />
            <van-field v-model="form.source" label="来源" placeholder="来源站点" maxlength="100" />
            <van-field v-model="form.tagsInput" label="标签" placeholder="前端,工具（逗号分隔）" maxlength="200" />
          </van-cell-group>

          <van-cell-group v-else inset style="margin-top:12px">
            <van-field v-model="form.content" label="内容 *" type="textarea" placeholder="名言内容" maxlength="2000" autosize rows="3" />
            <van-field v-model="form.author" label="作者" placeholder="作者姓名" maxlength="100" />
            <van-field v-model="form.source" label="出处" placeholder="书名/来源" maxlength="200" />
          </van-cell-group>
        </div>
      </div>
    </BottomSheet>

    <!-- 操作菜单 -->
    <van-action-sheet
      v-model:show="actionSheetShow"
      :actions="currentActions"
      cancel-text="取消"
      @select="onActionSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { showToast } from 'vant'
import { useFavoriteStore, type FavoriteType } from '../../stores/favorite'
import type { FavoriteItem } from '../../utils/db'
import BottomSheet from '../../components/BottomSheet.vue'

const store = useFavoriteStore()
const showSheet = ref(false)
const refreshing = ref(false)
const actionSheetShow = ref(false)
const currentActions = ref<Array<{ name: string; color?: string; _item?: FavoriteItem }>>([])
const activeItem = ref<FavoriteItem | null>(null)
const activeTab = ref<FavoriteType>('all')

const typeTabs = [
  { value: 'all' as FavoriteType, label: '全部' },
  { value: 'link' as FavoriteType, label: '链接' },
  { value: 'quote' as FavoriteType, label: '名言' },
]

function onTypeChange(name: string | number) {
  const type = name as FavoriteType
  store.selectType(type)
  store.loadList(type)
}

const form = ref({ type: 'link' as 'link' | 'quote', title: '', url: '', content: '', author: '', source: '', tagsInput: '' })

onMounted(() => store.loadList(store.selectedType))

async function onRefresh() { await store.loadList(store.selectedType); refreshing.value = false }
function onSearch(kw: string) { store.setSearch(kw) }

function parseTags(tags: string): string[] {
  try { return JSON.parse(tags) } catch { return [] }
}

function openUrl(url: string) {
  if (url.startsWith('http')) window.open(url, '_blank')
}

function showItemActions(item: FavoriteItem) {
  activeItem.value = item
  const actions: typeof currentActions.value = []
  if (item.type === 'link') actions.push({ name: '复制链接' })
  actions.push({ name: item.is_pinned ? '取消置顶' : '置顶' })
  actions.push({ name: '删除', color: '#ff3b30' })
  currentActions.value = actions
  actionSheetShow.value = true
}

async function onActionSelect(action: { name: string }) {
  const item = activeItem.value
  if (!item) return
  actionSheetShow.value = false
  if (action.name === '复制链接') {
    await navigator.clipboard?.writeText(item.url)
    showToast('已复制')
  } else if (action.name === '置顶' || action.name === '取消置顶') {
    await store.pinFavorite(item.id, !item.is_pinned)
  } else if (action.name === '删除') {
    await store.removeFavorite(item.id)
    showToast('已删除')
  }
}

function extractTitle() {
  if (!form.value.title && form.value.url) {
    try { const u = new URL(form.value.url); form.value.title = u.hostname; form.value.source = u.hostname } catch {}
  }
}

function showAddDialog() {
  form.value = { type: 'link', title: '', url: '', content: '', author: '', source: '', tagsInput: '' }
  showSheet.value = true
}
function closePopup() { showSheet.value = false }

async function submitAdd() {
  if (form.value.type === 'link' && !form.value.url.trim()) { showToast('请输入链接'); return }
  if (form.value.type === 'quote' && !form.value.content.trim()) { showToast('请输入名言内容'); return }
  const tags = form.value.tagsInput
    ? JSON.stringify(form.value.tagsInput.split(',').map(t => t.trim()).filter(Boolean))
    : '[]'
  await store.addFavorite({
    type: form.value.type,
    title: form.value.title.trim() || (form.value.type === 'link' ? form.value.url : form.value.content.slice(0, 30)),
    url: form.value.url.trim(), content: form.value.content.trim(),
    author: form.value.author.trim(), source: form.value.source.trim(),
    tags, is_pinned: 0,
  })
  closePopup()
}
</script>

<style lang="scss" scoped>
.favorite-page { display: flex; flex-direction: column; height: 100%; background: $color-bg; }
.list-wrap { flex: 1; overflow-y: auto; }
.loading-center { display: flex; justify-content: center; padding: 40px; }
.list-inner { padding: 8px 12px 80px; display: flex; flex-direction: column; gap: 10px; }

.fav-card { background: #fff; border-radius: $radius-lg; padding: 14px; box-shadow: $shadow-sm; display: flex; flex-direction: column; gap: 6px; }
.fav-header { display: flex; align-items: center; justify-content: space-between; }
.fav-header-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.fav-title { font-size: $font-md; font-weight: $font-medium; color: $color-text-primary; flex: 1; }
.fav-url { font-size: $font-sm; color: $color-primary; cursor: pointer; }
.tag-list { display: flex; flex-wrap: wrap; gap: 4px; }

.fav-card.quote { position: relative; padding-left: 20px; }
.quote-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: $color-warning; border-radius: $radius-lg 0 0 $radius-lg; }
.quote-body { display: flex; flex-direction: column; gap: 6px; }
.quote-text { font-size: $font-md; color: $color-text-primary; line-height: 1.7; font-style: italic; margin: 0; }
.quote-footer { display: flex; align-items: center; justify-content: space-between; }
.quote-author { font-size: $font-sm; color: $color-text-secondary; }

.fab { position: fixed; right: 20px; bottom: 80px; width: 50px; height: 50px; border-radius: 50%; background: $color-primary; display: flex; align-items: center; justify-content: center; box-shadow: $shadow-lg; cursor: pointer; }

.sheet-inner { max-height: 90vh; display: flex; flex-direction: column; }
.form-wrap { overflow-y: auto; padding: 12px 0 calc(env(safe-area-inset-bottom) + 12px); }
</style>
