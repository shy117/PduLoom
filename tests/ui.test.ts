import { describe, expect, it } from 'vitest';
import { pages } from '../src/ui/navigation';
import { resolveTheme, toggleTheme } from '../src/ui/theme';

describe('基础界面配置', () => {
  it('格式转换提供独立导航入口', () => {
    expect(pages.map(page => page.id)).toEqual(['builder', 'parser', 'format', 'checksum', 'converter']);
  });
  it('优先恢复用户主题，否则使用系统偏好', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme('invalid', false)).toBe('light');
  });
  it('主题可以双向切换', () => {
    expect(toggleTheme('light')).toBe('dark');
    expect(toggleTheme('dark')).toBe('light');
  });
});
