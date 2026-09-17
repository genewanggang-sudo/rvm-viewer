import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViewerController, ViewerUiState } from '../src/hooks/useViewer.js';

const { useViewer } = vi.hoisted(() => ({ useViewer: vi.fn() }));

vi.mock('../src/hooks/useViewer.js', () => ({ useViewer }));

import App from '../src/App.js';

const ui: ViewerUiState = {
  phase: 'idle',
  source: '未指定数据（可上传文件或使用 ?demo=1）',
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
    loadLocalFiles: vi.fn().mockResolvedValue(undefined),
  };
}

describe('App', () => {
  beforeEach(() => {
    useViewer.mockReturnValue(controller());
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => vi.clearAllMocks());

  it('shows the local upload interface in the normal viewer', () => {
    render(<App />);
    expect(screen.getByLabelText('三维模型视图')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: '本地模型上传' })).toBeInTheDocument();
    expect(useViewer).toHaveBeenCalledWith(100 * 1024 * 1024);
  });

  it('hides surrounding controls in embed mode', () => {
    window.history.replaceState({}, '', '/?embed=1');
    render(<App />);
    expect(screen.queryByRole('form', { name: '本地模型上传' })).not.toBeInTheDocument();
    expect(screen.queryByText('就绪')).not.toBeInTheDocument();
  });

  it('shows the error overlay for a load failure', () => {
    useViewer.mockReturnValue(controller({ phase: 'error', error: '无法读取模型' }));
    render(<App />);
    expect(screen.getByRole('alert')).toHaveTextContent('无法读取模型');
  });
});
