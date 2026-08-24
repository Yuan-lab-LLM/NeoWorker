export default {
  metadata: {
    title: "{{文档标题}}",
    author: "{{作者}}",
    subject: "{{主题}}",
    language: "chinese",
  },
  theme: {
    serif: "Source Han Serif SC",
    sans: "Source Han Sans SC",
  },
  slides: [
    {
      kind: "cover",
      title: "{{文档标题}}",
      subtitle: "{{一句话描述}}",
      footer: "{{作者}} · 2026.04",
    },
    {
      kind: "toc",
      title: "目录",
      items: ["{{章节 1}}", "{{章节 2}}", "{{章节 3}}", "Q&A"],
    },
    {
      kind: "chapter",
      number: "01",
      title: "{{章节标题}}",
    },
    {
      kind: "content",
      eyebrow: "{{章节 · 本页}}",
      title: "{{核心论点标题}}",
      body: [
        "{{一段正文，控制在 2-3 个要点内，保证投影阅读性。}}",
        "{{一页一个核心信息，不要靠缩小字号塞内容。}}",
      ],
      pageNumber: 5,
    },
    {
      kind: "metrics",
      title: "关键结果",
      metrics: [
        { value: "+42%", label: "转化率提升" },
        { value: "3.8M", label: "月活用户" },
        { value: "99.9%", label: "可用性 SLA" },
      ],
    },
    {
      kind: "quote",
      quote: "好的设计是尽可能少的设计。",
      source: "Dieter Rams",
    },
    {
      kind: "ending",
      message: "谢谢",
      contact: "{{邮箱}} · {{网站}}",
    },
  ],
};
