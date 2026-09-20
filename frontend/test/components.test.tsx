import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErrorOverlay } from '../src/components/ErrorOverlay.js';
import { CameraToolbar } from '../src/components/CameraToolbar.js';
import { Hud } from '../src/components/Hud.js';
import { LocalFileLoader } from '../src/components/LocalFileLoader.js';
import { ModelExplorer } from '../src/components/ModelExplorer.js';
import { PropertiesPanel } from '../src/components/PropertiesPanel.js';
import { StatusBar } from '../src/components/StatusBar.js';
import type { ViewerUiState } from '../src/hooks/useViewer.js';
import type { RvmTreeNode } from '../src/viewer/rvmSdk.js';

const ui: ViewerUiState = {
  phase: 'loaded',
  source: '本地选择文件',
  name: 'plant.rvm',
  format: 'RVM',
  vertices: 10,
  triangles: 4,
  detail: '节点 2',
  error: null,
};

describe('viewer display components', () => {
  it('renders metadata and all non-loaded state labels', () => {
    const { rerender } = render(<Hud ui={ui} />);
    expect(screen.getByText('plant.rvm')).toBeInTheDocument();
    expect(screen.getByText('顶点')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText(/节点 2/)).toBeInTheDocument();

    rerender(<Hud ui={{ ...ui, phase: 'loading' }} />);
    expect(screen.getByText(/加载中/)).toBeInTheDocument();
    rerender(<Hud ui={{ ...ui, phase: 'parsing' }} />);
    expect(screen.getByText(/解析中/)).toBeInTheDocument();
    rerender(<Hud ui={{ ...ui, phase: 'error' }} />);
    expect(screen.getByText(/出错/)).toBeInTheDocument();

    rerender(<Hud ui={{ ...ui, detail: null }} />);
    expect(screen.queryByText('节点 2')).not.toBeInTheDocument();

    rerender(<StatusBar ui={{ ...ui, phase: 'idle' }} />);
    expect(screen.getByText('就绪')).toBeInTheDocument();
    rerender(<StatusBar ui={{ ...ui, phase: 'loading' }} />);
    expect(screen.getByText('正在加载数据…')).toBeInTheDocument();
    rerender(<StatusBar ui={{ ...ui, phase: 'parsing' }} />);
    expect(screen.getByText('正在解析模型…')).toBeInTheDocument();
    rerender(<StatusBar ui={{ ...ui, phase: 'error' }} />);
    expect(screen.getByText('加载出错')).toBeInTheDocument();
    rerender(<StatusBar ui={ui} />);
    expect(screen.getByText(/模型已加载/)).toBeInTheDocument();
  });

  it('shows accessible errors', () => {
    render(<ErrorOverlay message="文件格式错误" />);
    expect(screen.getByRole('alert')).toHaveTextContent('文件格式错误');
  });
});

describe('LocalFileLoader', () => {
  it('requires one RVM file before submitting', async () => {
    const user = userEvent.setup();
    render(
      <LocalFileLoader
        maxFileBytes={10 * 1024 * 1024}
        onLoad={vi.fn()}
        onLoadTest={vi.fn()}
        showTestModel={false}
      />
    );
    await user.click(screen.getByRole('button', { name: '加载模型' }));
    expect(screen.getByText('请选择一个 .rvm 文件')).toBeInTheDocument();
  });

  it('loads one selected RVM and supports clearing the selection', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn().mockResolvedValue(undefined);
    render(
      <LocalFileLoader
        maxFileBytes={12 * 1024 * 1024}
        onLoad={onLoad}
        onLoadTest={vi.fn()}
        showTestModel={false}
      />
    );
    const input = screen.getByLabelText('选择 RVM 文件');
    await user.upload(input, new File(['model'], 'plant.rvm', { type: 'application/octet-stream' }));
    await user.click(screen.getByRole('button', { name: '加载模型' }));
    expect(onLoad).toHaveBeenCalledWith(expect.objectContaining({ name: 'plant.rvm' }), undefined);
    expect(screen.getByText(/RVM \+ 可选 ATT/)).toBeInTheDocument();

    fireEvent.change(input, { target: { files: null } });
    await user.click(screen.getByRole('button', { name: '加载模型' }));
    expect(screen.getByText('请选择一个 .rvm 文件')).toBeInTheDocument();
  });

  it('passes an optional attribute file with the selected RVM', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn().mockResolvedValue(undefined);
    render(
      <LocalFileLoader
        maxFileBytes={12 * 1024 * 1024}
        onLoad={onLoad}
        onLoadTest={vi.fn()}
        showTestModel={false}
      />
    );
    const model = new File(['model'], 'plant.rvm');
    const attributes = new File(['attrs'], 'plant.txt');
    await user.upload(screen.getByLabelText('选择 RVM 文件'), model);
    await user.upload(screen.getByLabelText('选择属性文件'), attributes);
    expect(screen.getByText('plant.txt')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '加载模型' }));
    expect(onLoad).toHaveBeenCalledWith(model, attributes);

    fireEvent.change(screen.getByLabelText('选择属性文件'), { target: { files: null } });
    expect(screen.getByText('选择属性文件（可选）')).toBeInTheDocument();
  });

  it('shows and runs the optional local test button', async () => {
    const user = userEvent.setup();
    const onLoadTest = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <LocalFileLoader maxFileBytes={1} onLoad={vi.fn()} onLoadTest={onLoadTest} showTestModel />
    );
    await user.click(screen.getByRole('button', { name: '加载测试模型' }));
    expect(onLoadTest).toHaveBeenCalledOnce();

    rerender(
      <LocalFileLoader maxFileBytes={1} onLoad={vi.fn()} onLoadTest={vi.fn()} showTestModel={false} />
    );
    expect(screen.queryByRole('button', { name: '加载测试模型' })).not.toBeInTheDocument();
  });
});

const tree: RvmTreeNode = {
  name: 'ROOT',
  segments: ['ROOT'],
  visible: true,
  excluded: false,
  entityCount: 1,
  propertyCount: 1,
  children: [
    {
      name: '',
      segments: ['ROOT', 'CHILD'],
      visible: true,
      excluded: false,
      entityCount: 0,
      propertyCount: 0,
      children: [],
    },
  ],
};

describe('model information panels', () => {
  const explorerProps = {
    hiddenKeys: new Set<string>(),
    onLocate: vi.fn(),
    onToggleVisible: vi.fn(),
    onIsolate: vi.fn(),
    onResetVisibility: vi.fn(),
    onClose: vi.fn(),
    open: true,
  };

  it('expands, selects, collapses, and closes the model tree', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(
      <ModelExplorer
        tree={tree}
        selectedNode={tree}
        attributeStats={{ loaded: true, attached: 4, missed: 2 }}
        onSelect={onSelect}
        {...explorerProps}
        onClose={onClose}
        open
      />
    );
    expect(screen.getByText('属性挂接 4 · 未匹配 2')).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: /ROOT/ })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('button', { name: '(未命名节点)' }));
    expect(onSelect).toHaveBeenCalledWith(tree.children[0]);
    await user.click(screen.getByRole('button', { name: '收起 ROOT' }));
    expect(screen.queryByRole('button', { name: '(未命名节点)' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '展开 ROOT' }));
    await user.click(screen.getByRole('button', { name: '关闭模型结构' }));
    expect(onClose).toHaveBeenCalledOnce();

    rerender(
      <ModelExplorer
        tree={tree}
        selectedNode={null}
        attributeStats={{ loaded: false, attached: 0, missed: 0 }}
        onSelect={onSelect}
        {...explorerProps}
        onClose={onClose}
        open={false}
      />
    );
    expect(screen.getByText('未加载外部属性')).toBeInTheDocument();
  });

  it('exposes locate, isolate, and visibility tools on tree rows', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onLocate = vi.fn();
    const onToggleVisible = vi.fn();
    const onIsolate = vi.fn();
    render(
      <ModelExplorer
        tree={tree}
        selectedNode={null}
        attributeStats={{ loaded: false, attached: 0, missed: 0 }}
        onSelect={onSelect}
        {...explorerProps}
        onLocate={onLocate}
        onToggleVisible={onToggleVisible}
        onIsolate={onIsolate}
        open
      />
    );

    await user.dblClick(screen.getByRole('button', { name: 'ROOT 1' }));
    expect(onSelect).toHaveBeenCalledWith(tree);
    expect(onLocate).toHaveBeenCalledWith(tree);

    await user.click(screen.getByRole('button', { name: '隔离显示 ROOT' }));
    expect(onIsolate).toHaveBeenCalledWith(tree);

    await user.click(screen.getByRole('button', { name: '隐藏 ROOT' }));
    expect(onToggleVisible).toHaveBeenCalledWith(tree, '0');

    await user.click(screen.getByRole('button', { name: '定位 ROOT' }));
    expect(onLocate).toHaveBeenCalledWith(tree);

    // 无三维实体的组织节点不提供定位/隔离/显隐工具
    expect(screen.queryByRole('button', { name: '隐藏 (未命名节点)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '隔离显示 (未命名节点)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '定位 (未命名节点)' })).not.toBeInTheDocument();
  });

  it('dims hidden branches and offers a restore action', async () => {
    const user = userEvent.setup();
    const onResetVisibility = vi.fn();
    // 夹具：'' 组有实体子级 LEAF（级联淡化 + 隐藏态眼睛图标），EMPTY 组无实体（无工具图标）
    const leaf: RvmTreeNode = {
      name: 'LEAF',
      segments: ['ROOT', '', 'LEAF'],
      visible: true,
      excluded: false,
      entityCount: 1,
      propertyCount: 0,
      children: [],
    };
    const unnamedGroup: RvmTreeNode = {
      name: '',
      segments: ['ROOT', ''],
      visible: true,
      excluded: false,
      entityCount: 1,
      propertyCount: 0,
      children: [leaf],
    };
    const emptyGroup: RvmTreeNode = {
      name: 'EMPTY',
      segments: ['ROOT', 'EMPTY'],
      visible: true,
      excluded: false,
      entityCount: 0,
      propertyCount: 0,
      children: [],
    };
    const dimTree: RvmTreeNode = {
      name: 'ROOT',
      segments: ['ROOT'],
      visible: true,
      excluded: false,
      entityCount: 2,
      propertyCount: 0,
      children: [unnamedGroup, emptyGroup],
    };
    const { rerender } = render(
      <ModelExplorer
        tree={dimTree}
        selectedNode={null}
        attributeStats={{ loaded: false, attached: 0, missed: 0 }}
        onSelect={vi.fn()}
        {...explorerProps}
        hiddenKeys={new Set(['0/0', '0/1'])}
        onResetVisibility={onResetVisibility}
        open
      />
    );

    // 隐藏的具名空组：淡化但无工具图标，名称带空组样式且悬停有说明
    const emptyRow = screen.getByText('EMPTY').closest('.rv-tree__row');
    expect(emptyRow).toHaveClass('rv-tree__row--hidden');
    expect(emptyRow?.querySelectorAll('.rv-tree__tools button')).toHaveLength(0);
    expect(screen.getByText('EMPTY')).toHaveClass('rv-tree__name--empty');
    expect(screen.getByRole('button', { name: 'EMPTY' }).getAttribute('title')).toContain('无三维实体');

    // 隐藏的无名组：行淡化 + 眼睛为 EyeOff + 祖先级联淡化到 LEAF
    const unnamedRow = screen.getByText('(未命名节点)').closest('.rv-tree__row');
    expect(unnamedRow).toHaveClass('rv-tree__row--hidden');
    expect(
      within(unnamedRow as HTMLElement).getByRole('button', { name: '显示 (未命名节点)' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '展开 (未命名节点)' }));
    const leafRow = screen.getByText('LEAF').closest('.rv-tree__row');
    expect(leafRow).toHaveClass('rv-tree__row--hidden');
    expect(screen.getByText('ROOT').closest('.rv-tree__row')).not.toHaveClass('rv-tree__row--hidden');

    await user.click(screen.getByRole('button', { name: '恢复全部显示' }));
    expect(onResetVisibility).toHaveBeenCalledOnce();

    rerender(
      <ModelExplorer
        tree={dimTree}
        selectedNode={null}
        attributeStats={{ loaded: false, attached: 0, missed: 0 }}
        onSelect={vi.fn()}
        {...explorerProps}
        hiddenKeys={new Set()}
        onResetVisibility={onResetVisibility}
        open
      />
    );
    expect(screen.queryByRole('button', { name: '恢复全部显示' })).not.toBeInTheDocument();
    expect(unnamedRow?.classList.contains('rv-tree__row--hidden')).toBe(false);
  });

  it('searches nodes by name and locates a picked result', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onLocate = vi.fn();
    render(
      <ModelExplorer
        tree={tree}
        selectedNode={null}
        attributeStats={{ loaded: false, attached: 0, missed: 0 }}
        onSelect={onSelect}
        {...explorerProps}
        onLocate={onLocate}
        open
      />
    );

    await user.type(screen.getByRole('searchbox', { name: '按名称查找节点' }), 'root');
    const result = screen.getByRole('button', { name: 'ROOT (根节点)' });
    await user.click(result);
    expect(onSelect).toHaveBeenCalledWith(tree);
    expect(onLocate).toHaveBeenCalledWith(tree);

    await user.click(screen.getByRole('button', { name: '清除查找' }));
    expect(screen.queryByRole('button', { name: 'ROOT (根节点)' })).not.toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: '按名称查找节点' }), '不存在');
    expect(screen.getByText('没有匹配的节点')).toBeInTheDocument();
  });

  it('re-expands ancestors when the selected node changes from outside', async () => {
    const user = userEvent.setup();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      const { rerender } = render(
        <ModelExplorer
          tree={tree}
          selectedNode={null}
          attributeStats={{ loaded: false, attached: 0, missed: 0 }}
          onSelect={vi.fn()}
          {...explorerProps}
          open
        />
      );
      await user.click(screen.getByRole('button', { name: '收起 ROOT' }));
      expect(screen.queryByText('(未命名节点)')).not.toBeInTheDocument();
      expect(scrollIntoView).not.toHaveBeenCalled();

      rerender(
        <ModelExplorer
          tree={tree}
          selectedNode={tree.children[0]}
          attributeStats={{ loaded: false, attached: 0, missed: 0 }}
          onSelect={vi.fn()}
          {...explorerProps}
          open
        />
      );
      expect(screen.getByRole('button', { name: '(未命名节点)' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '(未命名节点)' }).closest('li')).toHaveAttribute(
        'aria-selected',
        'true'
      );
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });

      // A stale selection that is not part of the current tree is ignored.
      rerender(
        <ModelExplorer
          tree={tree}
          selectedNode={{ ...tree.children[0] }}
          attributeStats={{ loaded: false, attached: 0, missed: 0 }}
          onSelect={vi.fn()}
          {...explorerProps}
          open
        />
      );
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it('caps the search result list when a query matches many nodes', async () => {
    const user = userEvent.setup();
    const wide: RvmTreeNode = {
      ...tree,
      children: Array.from({ length: 250 }, (_, index) => ({
        ...tree.children[0],
        name: `PIP-${index}`,
        segments: ['ROOT', `PIP-${index}`],
      })),
    };
    render(
      <ModelExplorer
        tree={wide}
        selectedNode={null}
        attributeStats={{ loaded: false, attached: 0, missed: 0 }}
        onSelect={vi.fn()}
        {...explorerProps}
        open
      />
    );

    await user.type(screen.getByRole('searchbox', { name: '按名称查找节点' }), 'pip');
    expect(screen.getByText('仅显示前 200 条结果')).toBeInTheDocument();
    const results = within(screen.getByLabelText('查找结果'));
    expect(results.getAllByRole('button', { name: /^PIP-/ })).toHaveLength(200);
  });

  it('resizes the dock by dragging, resets on double click, and persists width', async () => {
    const user = userEvent.setup();
    window.localStorage.removeItem('rv-tree-width');
    render(
      <ModelExplorer
        tree={tree}
        selectedNode={null}
        attributeStats={{ loaded: false, attached: 0, missed: 0 }}
        onSelect={vi.fn()}
        {...explorerProps}
        open
      />
    );
    const widthVar = () => document.documentElement.style.getPropertyValue('--rv-dock-left-width');
    expect(widthVar()).toBe('280px');

    const handle = screen.getByRole('separator', { name: '调整面板宽度' });
    // jsdom 的 PointerEvent 可能不带 clientX，组件对 NaN 做了防御；这里补 pointerId 走正常分支
    const pointerWithId = (type: string, clientX: number): void => {
      const event = new MouseEvent(type, { clientX, bubbles: true });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      fireEvent(handle, event);
    };
    // 支持 pointer capture 的浏览器会在拖拽开始时捕获指针
    const capture = vi.fn();
    Object.defineProperty(handle, 'setPointerCapture', { configurable: true, value: capture });
    pointerWithId('pointerdown', 300);
    expect(capture).toHaveBeenCalledWith(1);
    pointerWithId('pointermove', 460);
    pointerWithId('pointerup', 460);
    delete (handle as unknown as { setPointerCapture?: unknown }).setPointerCapture;
    expect(widthVar()).toBe('440px');
    expect(window.localStorage.getItem('rv-tree-width')).toBe('440');

    // 无活动拖拽时的 pointerup 是安全空操作
    pointerWithId('pointerup', 300);
    expect(widthVar()).toBe('440px');

    // 键盘微调与越界钳制
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(widthVar()).toBe('424px');
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(widthVar()).toBe('440px');
    fireEvent.keyDown(handle, { key: 'Home' });
    expect(widthVar()).toBe('280px');
    pointerWithId('pointerdown', 9000);
    pointerWithId('pointermove', 20000);
    pointerWithId('pointerup', 20000);
    expect(Number.parseInt(widthVar().replace('px', ''), 10)).toBeLessThanOrEqual(
      Math.round(window.innerWidth * 0.6)
    );

    // 无 clientX 的异常事件不产生 NaN
    pointerWithId('pointerdown', 300);
    const badMove = new MouseEvent('pointermove', { bubbles: true });
    Object.defineProperty(badMove, 'pointerId', { value: 1 });
    fireEvent(handle, badMove);
    pointerWithId('pointerup', 300);
    expect(widthVar()).not.toBe('NaNpx');

    // 双击复位
    await user.dblClick(handle);
    expect(widthVar()).toBe('280px');
    window.localStorage.removeItem('rv-tree-width');
  });

  it('falls back to the default width when localStorage is unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage blocked');
      },
    });
    try {
      render(
        <ModelExplorer
          tree={tree}
          selectedNode={null}
          attributeStats={{ loaded: false, attached: 0, missed: 0 }}
          onSelect={vi.fn()}
          {...explorerProps}
          open
        />
      );
      const widthVar = () => document.documentElement.style.getPropertyValue('--rv-dock-left-width');
      expect(widthVar()).toBe('280px');

      const handle = screen.getByRole('separator', { name: '调整面板宽度' });
      fireEvent.keyDown(handle, { key: 'ArrowRight' });
      expect(widthVar()).toBe('296px');
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
  });

  it('renders all property panel states and closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(
      <PropertiesPanel node={tree} properties={[]} phase="loading" error={null} onClose={onClose} open />
    );
    expect(screen.getByText('正在读取属性…')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '关闭节点属性' }));
    expect(onClose).toHaveBeenCalledOnce();

    rerender(
      <PropertiesPanel
        node={tree}
        properties={[]}
        phase="error"
        error="查询失败"
        onClose={onClose}
        open={false}
      />
    );
    expect(screen.getByText('查询失败')).toBeInTheDocument();

    rerender(
      <PropertiesPanel
        node={tree.children[0]}
        properties={[]}
        phase="loaded"
        error={null}
        onClose={onClose}
        open={false}
      />
    );
    expect(screen.getByText('此节点没有属性')).toBeInTheDocument();

    rerender(
      <PropertiesPanel
        node={null}
        properties={[{ name: 'Tag', value: 'P-101' }]}
        phase="loaded"
        error={null}
        onClose={onClose}
        open={false}
      />
    );
    expect(screen.getByText('Tag')).toBeInTheDocument();
    expect(screen.getByText('P-101')).toBeInTheDocument();
  });
});

describe('CameraToolbar', () => {
  it('runs locate, frame, and reset commands only when a model is loaded', async () => {
    const user = userEvent.setup();
    const onFrame = vi.fn();
    const onReset = vi.fn();
    const onLocateSelected = vi.fn();
    const { rerender } = render(
      <CameraToolbar
        disabled={false}
        onFrame={onFrame}
        onReset={onReset}
        onLocateSelected={onLocateSelected}
      />
    );

    await user.click(screen.getByRole('button', { name: '定位选中节点' }));
    await user.click(screen.getByRole('button', { name: '按当前视角适配模型' }));
    await user.click(screen.getByRole('button', { name: '恢复等轴视图' }));
    expect(onLocateSelected).toHaveBeenCalledOnce();
    expect(onFrame).toHaveBeenCalledOnce();
    expect(onReset).toHaveBeenCalledOnce();

    rerender(
      <CameraToolbar disabled onFrame={onFrame} onReset={onReset} onLocateSelected={onLocateSelected} />
    );
    expect(screen.getByRole('button', { name: '定位选中节点' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '按当前视角适配模型' })).toBeDisabled();
  });
});
