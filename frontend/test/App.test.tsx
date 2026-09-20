import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViewerController, ViewerUiState } from '../src/hooks/useViewer.js';
import type { RvmTreeNode } from '../src/viewer/rvmSdk.js';

const { useViewer, runtimeConfig } = vi.hoisted(() => ({
  useViewer: vi.fn(),
  runtimeConfig: { title: 'RVM Viewer', maxLocalFileBytes: 100 * 1024 * 1024, devUiEnabled: true },
}));
vi.mock('../src/hooks/useViewer.js', () => ({ useViewer }));
vi.mock('../src/config.js', () => ({ runtimeConfig }));

import App from '../src/App.js';

const ui: ViewerUiState = {
  phase: 'idle',
  source: '请选择一个 RVM 文件',
  name: 'RVM Viewer',
  format: '-',
  vertices: 0,
  triangles: 0,
  detail: null,
  error: null,
};

const tree: RvmTreeNode = {
  name: 'plant',
  segments: ['plant'],
  visible: true,
  excluded: false,
  entityCount: 1,
  propertyCount: 1,
  children: [],
};

function controller(overrides: Partial<ViewerUiState> = {}): ViewerController {
  return {
    canvasRef: createRef<HTMLCanvasElement>(),
    ui: { ...ui, ...overrides },
    tree: null,
    selectedNode: null,
    properties: [],
    propertyPhase: 'idle',
    propertyError: null,
    attributeStats: null,
    hiddenKeys: new Set<string>(),
    loadLocalRvm: vi.fn().mockResolvedValue(undefined),
    loadTestRvm: vi.fn().mockResolvedValue(undefined),
    selectNode: vi.fn().mockResolvedValue(undefined),
    clearSelection: vi.fn(),
    locateNode: vi.fn(),
    locateSelected: vi.fn(),
    toggleNodeVisible: vi.fn(),
    isolateNode: vi.fn(),
    resetVisibility: vi.fn(),
    frameCamera: vi.fn(),
    resetCamera: vi.fn(),
  };
}

describe('App', () => {
  beforeEach(() => {
    useViewer.mockReturnValue(controller());
    runtimeConfig.devUiEnabled = true;
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => vi.clearAllMocks());

  it('shows the local development loader over a blank canvas', () => {
    render(<App />);
    expect(screen.getByLabelText('三维模型视图')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'RVM 文件加载' })).toBeInTheDocument();
    expect(screen.queryByLabelText('等待加载模型')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '相机控制' })).toBeInTheDocument();
    expect(useViewer).toHaveBeenCalledWith(100 * 1024 * 1024);
  });

  it('hides development inputs but keeps the core viewer in embed mode', () => {
    window.history.replaceState({}, '', '/?embed=1');
    render(<App />);
    expect(screen.queryByRole('form', { name: 'RVM 文件加载' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '相机控制' })).toBeInTheDocument();
  });

  it('hides development inputs in a production standalone viewer', () => {
    runtimeConfig.devUiEnabled = false;
    render(<App />);
    expect(screen.queryByRole('form', { name: 'RVM 文件加载' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '相机控制' })).toBeInTheDocument();
  });

  it('keeps the loaded workspace free of the removed header and floating model card', () => {
    useViewer.mockReturnValue(controller({ phase: 'loaded', name: 'plant.rvm', format: 'RVM' }));
    window.history.replaceState({}, '', '/?embed=1');
    render(<App />);
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: '模型信息' })).not.toBeInTheDocument();
  });

  it('shows the model workspace and switches mobile panels', async () => {
    const user = userEvent.setup();
    const value = controller({ phase: 'loaded', name: 'plant.rvm', format: 'RVM' });
    value.tree = tree;
    value.selectedNode = tree;
    value.properties = [{ name: 'Tag', value: 'P-101' }];
    value.propertyPhase = 'loaded';
    value.attributeStats = { loaded: true, attached: 1, missed: 0 };
    useViewer.mockReturnValue(value);
    render(<App />);

    expect(screen.getByLabelText('模型结构')).toBeInTheDocument();
    expect(screen.getByLabelText('节点属性')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'RVM 文件加载' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '打开模型结构' }));
    expect(screen.getByLabelText('模型结构')).toHaveClass('rv-dock--open');
    await user.click(screen.getByRole('button', { name: 'plant 1' }));
    expect(value.selectNode).toHaveBeenCalledWith(tree);
    await user.click(screen.getByRole('button', { name: '关闭模型结构' }));
    expect(screen.getByLabelText('模型结构')).not.toHaveClass('rv-dock--open');
    await user.click(screen.getByRole('button', { name: '打开节点属性' }));
    expect(screen.getByLabelText('节点属性')).toHaveClass('rv-dock--open');
    await user.click(screen.getByRole('button', { name: '关闭节点属性' }));
    expect(screen.getByLabelText('节点属性')).not.toHaveClass('rv-dock--open');
  });

  it('routes the camera locate button to the controller', async () => {
    const user = userEvent.setup();
    const value = controller({ phase: 'loaded', name: 'plant.rvm', format: 'RVM' });
    value.tree = tree;
    value.selectedNode = tree;
    useViewer.mockReturnValue(value);
    render(<App />);

    await user.click(screen.getByRole('button', { name: '定位选中节点' }));
    expect(value.locateSelected).toHaveBeenCalledOnce();
  });

  it('shows the error overlay for a load failure', () => {
    useViewer.mockReturnValue(controller({ phase: 'error', error: '无法读取 RVM' }));
    render(<App />);
    expect(screen.getByRole('alert')).toHaveTextContent('无法读取 RVM');
  });
});
