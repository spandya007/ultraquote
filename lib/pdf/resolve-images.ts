import type { DocBlock } from "./types";

const SCHEME = "sb-storage://";

function parseBucketPath(url: string) {
  const rest = url.slice(SCHEME.length);
  const slash = rest.indexOf("/");
  return { bucket: rest.slice(0, slash), path: rest.slice(slash + 1) };
}

/**
 * Walks the document blocks, finds every `sb-storage://` image URL, and builds a
 * map of those URLs → signed https URLs (1-hour expiry). The serializer uses
 * this map so it can stay a pure, synchronous function.
 */
export async function buildImageUrlMap(
  blocks: DocBlock[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<Record<string, string>> {
  const urls = new Set<string>();
  for (const block of blocks) {
    if (block.type === "image" && typeof block.props?.url === "string" && block.props.url.startsWith(SCHEME)) {
      urls.add(block.props.url);
    }
  }

  const map: Record<string, string> = {};
  await Promise.all(
    [...urls].map(async (url) => {
      const { bucket, path } = parseBucketPath(url);
      const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
      if (data?.signedUrl) map[url] = data.signedUrl;
    })
  );
  return map;
}
