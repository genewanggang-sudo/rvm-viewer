import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViewerController, ViewerUiState } from '../src/hooks/useViewer.js';

const { useViewer } = vi.hoisted(() => ({ useViewer: vi.fn() }));
vi.mock('../src/hooks/useViewer.js', () => ({ useViewer }));

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

function controller(overrides: Partial<ViewerUiState> = {}): ViewerController {
  return {
    canvasRef: createRef<HTMLCanvasElement>(),
    ui: { ...ui, ...overrides },
    loadLocalRvm: vi.fn().mockResolvedValue(undefined),
    loadTestRvm: vi.fn().mockResolvedValue(undefined),
    frameCamera: vi.fn(),
    resetCamera: vi.fn(),
  };
}

describe('App', () => {
  beforeEach(() => {
    useViewer.mockReturnValue(controller());
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => vi.clearAllMocks());

  it('shows the single-file RVM interface in the normal viewer', () => {
    render(<App />);
    expect(screen.getByLabelText('三维模型视图')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'RVM 文件加载' })).toBeInTheDocument();
    expect(screen.getByLabelText('选择 RVM 文件')).toHaveAttribute('accept', '.rvm');
    expect(screen.getByRole('navigation', { name: '相机控制' })).toBeInTheDocument();
    expect(useViewer).toHaveBeenCalledWith(100 * 1024 * 1024);
  });

  it('hides surrounding controls in embed mode', () => {
    window.history.replaceState({}, '', '/?embed=1');
    render(<App />);
    expect(screen.queryByRole('form', { name: 'RVM 文件加载' })).not.toBeInTheDocument();
    expect(screen.queryByText('就绪')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '相机控制' })).not.toBeInTheDocument();
  });

  it('shows model information after a successful load', () => {
    useViewer.mockReturnValue(controller({ phase: 'loaded', name: 'plant.rvm', format: 'RVM' }));
    render(<App />);
    expect(screen.getByRole('complementary', { name: '模型信息' })).toBeInTheDocument();
  });

  it('shows the error overlay for a load failure', () => {
    useViewer.mockReturnValue(controller({ phase: 'error', error: '无法读取 RVM' }));
    render(<App />);
    expect(screen.getByRole('alert')).toHaveTextContent('无法读取 RVM');
  });
});
