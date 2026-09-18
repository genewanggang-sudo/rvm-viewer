export const LOCAL_RVM_ACCEPT = '.rvm';
export const LOCAL_ATTRIBUTES_ACCEPT = '.att,.attrib,.txt';

export interface LocalRvmModel {
  bytes: ArrayBuffer;
  name: string;
  attrs?: ArrayBuffer;
}

export async function readLocalRvm(file: File, maxBytes: number, attributes?: File): Promise<LocalRvmModel> {
  if (file.size === 0) throw new Error('RVM 文件为空');
  if (file.size > maxBytes)
    throw new Error(`RVM 文件超过 ${(maxBytes / 1024 / 1024).toFixed(0)} MB 本地限制`);
  if (!file.name.toLowerCase().endsWith('.rvm')) throw new Error('仅支持 .rvm 文件');

  if (attributes) validateAttributes(attributes, maxBytes);
  const [bytes, attrs] = await Promise.all([file.arrayBuffer(), attributes?.arrayBuffer()]);
  return { bytes, name: file.name, ...(attrs ? { attrs } : {}) };
}

function validateAttributes(file: File, maxBytes: number): void {
  if (file.size === 0) throw new Error('属性文件为空');
  if (file.size > maxBytes)
    throw new Error(`属性文件超过 ${(maxBytes / 1024 / 1024).toFixed(0)} MB 本地限制`);
  if (!/\.(att|attrib|txt)$/i.test(file.name)) throw new Error('属性文件仅支持 .att、.attrib 或 .txt');
}
