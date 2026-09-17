import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErrorOverlay } from '../src/components/ErrorOverlay.js';
import { Hud } from '../src/components/Hud.js';
import { LocalFileLoader } from '../src/components/LocalFileLoader.js';
import { StatusBar } from '../src/components/StatusBar.js';
import type { ViewerUiState } from '../src/hooks/useViewer.js';

const ui: ViewerUiState = {
  phase: 'loaded',
  source: '本地手动上传',
  name: 'plant.rvm',
  format: 'RVM',
  vertices: 10,
  triangles: 4,
  detail: '节点 2',
  error: null,
};

describe('viewer display components', () => {
  it('renders the hud with model metadata and state', () => {
    render(<Hud ui={ui} />);
    expect(screen.getByText('plant.rvm')).toBeInTheDocument();
    expect(screen.getByText(/顶点 10/)).toBeInTheDocument();
    expect(screen.getByText(/节点 2/)).toBeInTheDocument();
    expect(screen.getByText('本地手动上传')).toBeInTheDocument();
  });

  it('renders a waiting hud without details and status variants', () => {
    const waiting = { ...ui, phase: 'waiting' as const, detail: null };
    const { rerender } = render(<Hud ui={waiting} />);
    expect(screen.getByText(/等待数据/)).toBeInTheDocument();

    rerender(<StatusBar ui={waiting} />);
    expect(screen.getByText('已连接，等待数据…')).toBeInTheDocument();
    rerender(<StatusBar ui={ui} />);
    expect(screen.getByText(/模型已加载/)).toBeInTheDocument();
  });

  it('shows accessible errors', () => {
    render(<ErrorOverlay message="文件格式错误" />);
    expect(screen.getByRole('alert')).toHaveTextContent('文件格式错误');
  });
});

describe('LocalFileLoader', () => {
  it('requires a model before submitting', async () => {
    const user = userEvent.setup();
    render(<LocalFileLoader maxFileBytes={10 * 1024 * 1024} onLoad={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '加载模型' }));
    expect(screen.getByText('请选择模型文件')).toBeInTheDocument();
  });

  it('submits a selected model and optional attributes', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn().mockResolvedValue(undefined);
    render(<LocalFileLoader maxFileBytes={12 * 1024 * 1024} onLoad={onLoad} />);
    await user.upload(
      screen.getByLabelText('模型文件'),
      new File(['model'], 'plant.rvm', { type: 'application/octet-stream' })
    );
    await user.upload(screen.getByLabelText('RVM 属性（可选）'), new File(['attr'], 'plant.att'));
    await user.click(screen.getByRole('button', { name: '加载模型' }));

    expect(onLoad).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'plant.rvm' }),
      expect.objectContaining({ name: 'plant.att' })
    );
    expect(screen.getByText(/单文件最多 12 MB/)).toBeInTheDocument();
  });

  it('accepts clearing either file input', () => {
    render(<LocalFileLoader maxFileBytes={1024} onLoad={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('模型文件'), { target: { files: null } });
    fireEvent.change(screen.getByLabelText('RVM 属性（可选）'), { target: { files: null } });
    expect(screen.getByRole('button', { name: '加载模型' })).toBeEnabled();
  });
});
