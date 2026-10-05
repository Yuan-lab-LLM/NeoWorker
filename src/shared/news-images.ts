import { NEWS_PUBLISHERS, type NewsPublisher } from "./news-sources";

// Article pages and media are restricted to the maintained publishers and their
// CDNs. A page cannot make the cover loader request an arbitrary remote host.
const MEDIA_CDNS: Partial<Record<NewsPublisher, readonly string[]>> = {
  qbitai: ["i.qbitai.com"],
  huxiu: ["img.huxiucdn.com"],
  engadget: ["s.yimg.com", "o.aolcdn.com", "www.blogcdn.com"],
  androidreviews: ["cdn.androidauthority.com"],
  zapier: ["images.ctfassets.net"],
  learningresearch: ["images.squarespace-cdn.com", "static1.squarespace.com"],
  benevans: ["images.squarespace-cdn.com", "static1.squarespace.com"],
  semianalysis: ["substackcdn.com", "substack-post-media.s3.amazonaws.com"],
  natureml: ["media.springernature.com", "www.nature.com"],
  cloudflare: ["cf-assets.www.cloudflare.com", "blog.cloudflare.com"],
  coursera: ["coursera-university-assets.s3.amazonaws.com"],
  cnblogs: ["images.cnblogs.com", "img2024.cnblogs.com", "img2023.cnblogs.com", "pic.cnblogs.com"],
  who: ["cdn.who.int"],
  bcg: ["web-assets.bcg.com"],
  yicai: ["imgcdn.yicai.com"],
  cls: ["img.cls.cn"],
  wallstreetcn: ["img.wallstreetcn.com", "image.wallstreetcn.com", "wpimg-wscn.awtmt.com"],
  ftchinese: ["i.ftimg.net", "i.ftimg.com"],
};

export const NEWS_IMAGE_SOURCES = Object.keys(NEWS_PUBLISHERS) as NewsPublisher[];
export const NEWS_PUBLISHER_IMAGE_HOSTS: Record<NewsPublisher, readonly string[]> =
  Object.fromEntries(NEWS_IMAGE_SOURCES.map(source => [source, [
    ...NEWS_PUBLISHERS[source].hosts, ...(MEDIA_CDNS[source] || []),
  ]])) as unknown as Record<NewsPublisher, readonly string[]>;

export function hasNewsImages(source: string): boolean {
  return NEWS_IMAGE_SOURCES.includes(source as NewsPublisher);
}

export function canShowNewsImages(_category: string, source: string): boolean {
  return source === "all" || hasNewsImages(source);
}
