async function transform(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  // Copy into a plain ArrayBuffer-backed array: Blob rejects SharedArrayBuffer views.
  const output = new Blob([new Uint8Array(bytes)])
    .stream()
    .pipeThrough(stream as unknown as TransformStream<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

export function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  return transform(bytes, new CompressionStream("gzip"));
}

export function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  return transform(bytes, new DecompressionStream("gzip"));
}
