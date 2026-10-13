<script setup lang="ts">
import { computed, ref } from 'vue';
import appLogo from '../src-tauri/icons/PduLoom.svg';
import { FileInput, ScanLine, ShieldCheck, ArrowLeftRight, Sun, Moon, ChevronRight, PanelLeftClose, PanelLeftOpen, Repeat } from 'lucide-vue-next';
import { pages, type PageId } from './ui/navigation';
import { resolveTheme, toggleTheme } from './ui/theme';
import FrameBuilder from './views/FrameBuilder.vue';
import FrameParser from './views/FrameParser.vue';
import Checksum from './views/Checksum.vue';
import DataConverter from './views/DataConverter.vue';
import FormatConverter from './views/FormatConverter.vue';

const activePage = ref<PageId>('builder');
const sidebarExpanded = ref(true);
const icons = { format: Repeat, builder: FileInput, parser: ScanLine, checksum: ShieldCheck, converter: ArrowLeftRight };
const views = { format: FormatConverter, builder: FrameBuilder, parser: FrameParser, checksum: Checksum, converter: DataConverter };
const page = computed(() => pages.find(item => item.id === activePage.value)!);

let savedTheme: string | null = null;
try { savedTheme = localStorage.getItem('pduloom-theme'); } catch { /* 存储受限时使用系统主题。 */ }
const theme = ref(resolveTheme(savedTheme, window.matchMedia('(prefers-color-scheme: dark)').matches));
function applyTheme() { document.documentElement.dataset.theme = theme.value; }
function changeTheme() {
  theme.value = toggleTheme(theme.value);
  applyTheme();
  try { localStorage.setItem('pduloom-theme', theme.value); } catch { /* 不影响当前会话切换。 */ }
}
applyTheme();
</script>

<template>
  <div class="app-shell">
    <aside id="app-sidebar" class="sidebar" :class="{ 'sidebar-collapsed': !sidebarExpanded }">
      <div class="sidebar-heading"><div class="brand"><img :src="appLogo" class="app-logo" alt="" width="32" height="32" /><strong>PduLoom</strong></div><button class="sidebar-toggle" :aria-label="sidebarExpanded ? '收起侧边栏' : '展开侧边栏'" :title="sidebarExpanded ? '收起侧边栏' : '展开侧边栏'" :aria-expanded="sidebarExpanded" aria-controls="app-sidebar" @click="sidebarExpanded = !sidebarExpanded"><PanelLeftClose v-if="sidebarExpanded" :size="20" /><PanelLeftOpen v-else :size="20" /></button></div>
      <nav aria-label="功能导航">
        <p class="nav-group">协议工具</p><div class="protocol-heading">Modbus</div>
        <button v-for="item in pages.slice(0, 3)" :key="item.id" class="nav-button" :class="{ active: activePage === item.id }" :aria-label="item.title" :title="sidebarExpanded ? undefined : item.title" :aria-current="activePage === item.id ? 'page' : undefined" @click="activePage = item.id"><component :is="icons[item.id]" :size="18" /><span class="nav-label">{{ item.title }}</span><ChevronRight v-if="activePage === item.id" :size="15" class="nav-arrow" /></button>
        <div class="planned-item">HJ 212 <span>计划支持</span></div><div class="planned-item">自定义协议 <span>计划支持</span></div>
        <p class="nav-group general-group">通用工具</p>
        <button v-for="item in pages.slice(3)" :key="item.id" class="nav-button" :class="{ active: activePage === item.id }" :aria-label="item.title" :title="sidebarExpanded ? undefined : item.title" :aria-current="activePage === item.id ? 'page' : undefined" @click="activePage = item.id"><component :is="icons[item.id]" :size="18" /><span class="nav-label">{{ item.title }}</span></button>
      </nav>
      <div class="sidebar-footer"><span class="status-dot"></span>本地计算<p>v0.1.0</p></div>
    </aside>
    <div class="main-shell">
      <header class="topbar"><div class="topbar-brand"><div class="brand"><img :src="appLogo" class="app-logo" alt="" width="32" height="32" /><strong>PduLoom</strong></div><span class="topbar-subtitle">多协议报文生成与解析工具</span></div><button class="theme-button" :aria-label="theme === 'light' ? '切换深色主题' : '切换浅色主题'" @click="changeTheme"><Moon v-if="theme === 'light'" :size="18" /><Sun v-else :size="18" /><span>{{ theme === 'light' ? '深色主题' : '浅色主题' }}</span></button></header>
      <main><div class="page-heading"><div><p class="eyebrow">{{ activePage === 'builder' || activePage === 'parser' || activePage === 'format' ? 'Modbus 协议工具' : '通用工具' }}</p><h1>{{ page.title }}</h1><p>{{ page.description }}</p></div></div>

        <KeepAlive><component :is="views[activePage]" /></KeepAlive>
      </main>
    </div>
  </div>
</template>
