import { Fragment, type ReactNode } from "react";
import { safeUrl, type RichNode } from "@/lib/content";
import { textStyle, blockStyle } from "@/lib/typography";
export function RichContent({ node }: { node: RichNode }) {
  if (!node || typeof node !== "object") return null;
  let children: ReactNode = node.content?.map((child, i) => (
    <RichContent key={i} node={child} />
  ));
  if (node.type === "text") {
    children = node.text;
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") children = <strong>{children}</strong>;
      if (mark.type === "italic") children = <em>{children}</em>;
      if (mark.type === "strike") children = <s>{children}</s>;
      if (mark.type === "underline") children = <u>{children}</u>;
      if (mark.type === "textStyle")
        children = <span style={textStyle(mark.attrs)}>{children}</span>;
      if (mark.type === "code") children = <code>{children}</code>;
      if (mark.type === "link" && safeUrl(mark.attrs?.href))
        children = (
          <a
            href={safeUrl(mark.attrs?.href)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        );
    }
    return <Fragment>{children}</Fragment>;
  }
  switch (node.type) {
    case "paragraph":
      return <p style={blockStyle(node.attrs)}>{children}</p>;
    case "heading":
      return node.attrs?.level === 3 ? (
        <h3 style={blockStyle(node.attrs)}>{children}</h3>
      ) : (
        <h2 style={blockStyle(node.attrs)}>{children}</h2>
      );
    case "bulletList":
      return <ul>{children}</ul>;
    case "orderedList":
      return <ol>{children}</ol>;
    case "listItem":
      return <li>{children}</li>;
    case "blockquote":
      return <blockquote>{children}</blockquote>;
    case "hardBreak":
      return <br />;
    case "horizontalRule":
      return <hr />;
    case "codeBlock":
      return (
        <pre>
          <code>{children}</code>
        </pre>
      );
    case "image":
      return safeUrl(node.attrs?.src) ? (
        <figure>
          <img
            src={safeUrl(node.attrs?.src)}
            alt={String(node.attrs?.alt ?? "")}
            loading="lazy"
            decoding="async"
          />
          {node.attrs?.title ? (
            <figcaption>{String(node.attrs.title)}</figcaption>
          ) : null}
        </figure>
      ) : null;
    default:
      return <Fragment>{children}</Fragment>;
  }
}
