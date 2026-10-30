import { pipeline } from '@xenova/transformers';

let embedder: Awaited<ReturnType<typeof pipeline>> | null = null;

export async function getEmbedding(text: string): Promise<number[]> {
  if (embedder === null) {
    console.log('Loading embedding model...');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }

  const output = await embedder(text, {
    pooling: 'mean',
     normalize: true as any,
    } as any);



  const embedding = Array.from((output as { data: Float32Array }).data);
  const norm = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? embedding : embedding.map((value) => value / norm);
}
