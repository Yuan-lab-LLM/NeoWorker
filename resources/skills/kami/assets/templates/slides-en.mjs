export default {
  metadata: {
    title: "{{DOCUMENT_TITLE}}",
    author: "{{AUTHOR}}",
    subject: "{{SUBJECT}}",
    language: "english",
  },
  theme: {
    serif: "Newsreader",
    sans: "Inter",
  },
  slides: [
    {
      kind: "cover",
      title: "{{DOCUMENT_TITLE}}",
      subtitle: "{{One-line description.}}",
      footer: "{{AUTHOR}} · 2026.04",
    },
    {
      kind: "toc",
      title: "Contents",
      items: ["{{Chapter 1}}", "{{Chapter 2}}", "{{Chapter 3}}", "Q&A"],
    },
    {
      kind: "chapter",
      number: "01",
      title: "{{Chapter Title}}",
    },
    {
      kind: "content",
      eyebrow: "{{Chapter · This page}}",
      title: "{{Core claim as a sentence}}",
      body: [
        "{{A short body paragraph, 14pt sans. Keep it focused and investor-readable.}}",
        "{{One slide, one idea. Split the story instead of shrinking type.}}",
      ],
      pageNumber: 5,
    },
    {
      kind: "metrics",
      title: "Key results",
      metrics: [
        { value: "+42%", label: "Conversion lift" },
        { value: "3.8M", label: "Monthly actives" },
        { value: "99.9%", label: "Availability SLA" },
      ],
    },
    {
      kind: "quote",
      quote: "Good design is as little design as possible.",
      source: "Dieter Rams",
    },
    {
      kind: "ending",
      message: "Thank you",
      contact: "{{EMAIL}} · {{WEBSITE}}",
    },
  ],
};
