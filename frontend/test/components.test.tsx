import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErrorOverlay } from '../src/components/ErrorOverlay.js';
import { CameraToolbar } from '../src/components/CameraToolbar.js';
import { Hud } from '../src/components/Hud.js';
import { LocalFileLoader } from '../src/components/LocalFileLoader.js';
import { StatusBar } from '../src/components/StatusBar.js';
import type { ViewerUiState } from '../src/hooks/useViewer.js';

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
    await user.click(screen.getByRole('button', { name: '加载所选 RVM' }));
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
    await user.click(screen.getByRole('button', { name: '加载所选 RVM' }));
    expect(onLoad).toHaveBeenCalledWith(expect.objectContaining({ name: 'plant.rvm' }));
    expect(screen.getByText(/单个 .rvm 文件/)).toBeInTheDocument();

    fireEvent.change(input, { target: { files: null } });
    await user.click(screen.getByRole('button', { name: '加载所选 RVM' }));
    expect(screen.getByText('请选择一个 .rvm 文件')).toBeInTheDocument();
  });

  it('shows and runs the optional local test button', async () => {
    const user = userEvent.setup();
    const onLoadTest = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <LocalFileLoader maxFileBytes={1} onLoad={vi.fn()} onLoadTest={onLoadTest} showTestModel />
    );
    await user.click(screen.getByRole('button', { name: '加载测试 RVM' }));
    expect(onLoadTest).toHaveBeenCalledOnce();

    rerender(
      <LocalFileLoader maxFileBytes={1} onLoad={vi.fn()} onLoadTest={vi.fn()} showTestModel={false} />
    );
    expect(screen.queryByRole('button', { name: '加载测试 RVM' })).not.toBeInTheDocument();
  });
});

describe('CameraToolbar', () => {
  it('runs frame and reset commands only when a model is loaded', async () => {
    const user = userEvent.setup();
    const onFrame = vi.fn();
    const onReset = vi.fn();
    const { rerender } = render(<CameraToolbar disabled={false} onFrame={onFrame} onReset={onReset} />);

    await user.click(screen.getByRole('button', { name: '按当前视角适配模型' }));
    await user.click(screen.getByRole('button', { name: '恢复等轴视图' }));
    expect(onFrame).toHaveBeenCalledOnce();
    expect(onReset).toHaveBeenCalledOnce();

    rerender(<CameraToolbar disabled onFrame={onFrame} onReset={onReset} />);
    expect(screen.getByRole('button', { name: '按当前视角适配模型' })).toBeDisabled();
  });
});
