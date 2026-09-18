export const LOCAL_RVM_ACCEPT = '.rvm';

export interface LocalRvmModel {
  bytes: ArrayBuffer;
  name: string;
}

export async function readLocalRvm(file: File, maxBytes: number): Promise<LocalRvmModel> {
  if (file.size === 0) throw new Error('RVM 文件为空');
  if (file.size > maxBytes)
    throw new Error(`RVM 文件超过 ${(maxBytes / 1024 / 1024).toFixed(0)} MB 本地限制`);
  if (!file.name.toLowerCase().endsWith('.rvm')) throw new Error('仅支持 .rvm 文件');

  return { bytes: await file.arrayBuffer(), name: file.name };
}
