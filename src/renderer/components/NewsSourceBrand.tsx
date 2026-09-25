import qbitai from "../assets/paper-news/publishers/qbitai.png";
import openalex from "../assets/paper-news/publishers/openalex.svg";
import arxiv from "../assets/paper-news/arxiv.svg";
import arxivWhite from "../assets/paper-news/arxiv-white.svg";
import huggingface from "../assets/paper-news/huggingface.svg";
import github from "../assets/paper-news/github-black.svg";
import githubWhite from "../assets/paper-news/github-white.svg";
import bcg from "../assets/paper-news/publishers/bcg.ico";
import benevans from "../assets/paper-news/publishers/benevans.webp";
import chinatalk from "../assets/paper-news/publishers/chinatalk.png";
import cloudflare from "../assets/paper-news/publishers/cloudflare.png";
import cls from "../assets/paper-news/publishers/cls.ico";
import cnblogs from "../assets/paper-news/publishers/cnblogs.png";
import csrc from "../assets/paper-news/publishers/csrc.ico";
import eetimes from "../assets/paper-news/publishers/eetimes.ico";
import fed from "../assets/paper-news/publishers/fed.ico";
import hackernews from "../assets/paper-news/publishers/hackernews.svg";
import huxiu from "../assets/paper-news/publishers/huxiu.png";
import miit from "../assets/paper-news/publishers/miit.png";
import nbs from "../assets/paper-news/publishers/nbs.ico";
import ndrc from "../assets/paper-news/publishers/ndrc.png";
import pboc from "../assets/paper-news/publishers/pboc.ico";
import semianalysis from "../assets/paper-news/publishers/semianalysis.png";
import stratechery from "../assets/paper-news/publishers/stratechery.png";
import trendforce from "../assets/paper-news/publishers/trendforce.png";
import wallstreetcn from "../assets/paper-news/publishers/wallstreetcn.png";
import yicai from "../assets/paper-news/publishers/yicai.ico";
const assets: Record<string, string> = {
  qbitai,
  openalex,
  arxiv,
  huggingface,
  github,
  "hf-papers": huggingface,
  "hf-models": huggingface,
  "hf-datasets": huggingface,
  bcg,
  benevans,
  chinatalk,
  cloudflare,
  cls,
  cnblogs,
  csrc,
  eetimes,
  fed,
  hackernews,
  huxiu,
  miit,
  nbs,
  ndrc,
  pboc,
  semianalysis,
  stratechery,
  trendforce,
  wallstreetcn,
  yicai,
};
const darkAssets: Record<string, string> = {
  arxiv: arxivWhite,
  github: githubWhite,
};
/** Local official marks, never a runtime third-party favicon request. */
export function NewsSourceBrand({ source }: { source: string }) {
  const asset = assets[source];
  if (!asset) return null;
  const dark = darkAssets[source];
  return (
    <span
      className={`pn-brand pn-brand-${source}${dark ? " pn-brand-has-dark" : ""}`}
      aria-hidden="true"
    >
      <img className="pn-brand-light" src={asset} alt="" />
      {dark && <img className="pn-brand-dark" src={dark} alt="" />}
    </span>
  );
}
