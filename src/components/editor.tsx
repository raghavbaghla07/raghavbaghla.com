"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyleKit } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import {
  Bold,
  Italic,
  Heading2,
  List,
  Quote,
  Undo2,
  Redo2,
  ImagePlus,
  Underline,
  Strikethrough,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link2,
  Unlink,
  RemoveFormatting,
} from "lucide-react";
import { useRef, useState } from "react";
import type { RichNode } from "@/lib/content";
import { uploadFile } from "@/lib/upload";
import { safeUrl } from "@/lib/content";
import { fontFamilies, fontSizes, inkColors } from "@/lib/typography";
export function Editor({
  initial,
  onChange,
  demo,
}: {
  initial: RichNode;
  onChange: (value: RichNode) => void;
  demo: boolean;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false },
      }),
      TextStyleKit.configure({ backgroundColor: false, lineHeight: false }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right"],
      }),
      Image,
      Placeholder.configure({
        placeholder: "A good idea starts with a few words…",
      }),
    ],
    content: initial,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor }) => onChange(editor.getJSON() as RichNode),
    editorProps: {
      attributes: {
        "aria-label": "Post content",
        role: "textbox",
        "aria-multiline": "true",
      },
    },
  });
  if (!editor)
    return <div className="editor-loading">Opening your notebook…</div>;
  async function insertImage(file?: File) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await uploadFile(file, demo);
      editor!
        .chain()
        .focus()
        .setImage({ src: result.url, alt: file.name.replace(/\.[^.]+$/, "") })
        .run();
      setMessage("Image inserted. Select it to edit its description below.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div className="editor">
      <div className="editor-toolbar">
        <select
          aria-label="Text style"
          value={
            editor.isActive("heading", { level: 2 })
              ? "2"
              : editor.isActive("heading", { level: 3 })
                ? "3"
                : "paragraph"
          }
          onChange={(e) =>
            e.target.value === "paragraph"
              ? editor.chain().focus().setParagraph().run()
              : editor
                  .chain()
                  .focus()
                  .setHeading({ level: Number(e.target.value) as 2 | 3 })
                  .run()
          }
        >
          <option value="paragraph">Paragraph</option>
          <option value="2">Heading</option>
          <option value="3">Subheading</option>
        </select>
        <select
          aria-label="Font family"
          value={editor.getAttributes("textStyle").fontFamily ?? ""}
          onChange={(e) =>
            e.target.value
              ? editor.chain().focus().setFontFamily(e.target.value).run()
              : editor.chain().focus().unsetFontFamily().run()
          }
        >
          <option value="">Default font</option>
          {fontFamilies.map((font) => (
            <option key={font.value} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Font size"
          value={editor.getAttributes("textStyle").fontSize ?? ""}
          onChange={(e) =>
            e.target.value
              ? editor.chain().focus().setFontSize(e.target.value).run()
              : editor.chain().focus().unsetFontSize().run()
          }
        >
          <option value="">Auto size</option>
          {fontSizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <select
          aria-label="Text colour"
          value={editor.getAttributes("textStyle").color ?? ""}
          onChange={(e) =>
            e.target.value
              ? editor.chain().focus().setColor(e.target.value).run()
              : editor.chain().focus().unsetColor().run()
          }
        >
          {inkColors.map((ink) => (
            <option key={ink.label} value={ink.value}>
              {ink.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Bold"
          aria-pressed={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={18} />
        </button>
        <button
          type="button"
          aria-label="Italic"
          aria-pressed={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={18} />
        </button>
        <button
          type="button"
          aria-label="Heading"
          aria-pressed={editor.isActive("heading")}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          <Heading2 size={18} />
        </button>
        <button
          type="button"
          aria-label="Bullet list"
          aria-pressed={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={18} />
        </button>
        <button
          type="button"
          aria-label="Quote"
          aria-pressed={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={18} />
        </button>
        <span />
        <button
          type="button"
          aria-label="Underline"
          aria-pressed={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <Underline size={18} />
        </button>
        <button
          type="button"
          aria-label="Strikethrough"
          aria-pressed={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={18} />
        </button>
        <button
          type="button"
          aria-label="Numbered list"
          aria-pressed={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={18} />
        </button>
        {(
          [
            { value: "left", icon: AlignLeft },
            { value: "center", icon: AlignCenter },
            { value: "right", icon: AlignRight },
          ] as const
        ).map(({ value, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-label={`Align ${value}`}
            aria-pressed={editor.isActive({ textAlign: value })}
            onClick={() => editor.chain().focus().setTextAlign(value).run()}
          >
            <Icon size={18} />
          </button>
        ))}
        <button
          type="button"
          aria-label="Add or edit link"
          aria-pressed={editor.isActive("link")}
          onClick={() => {
            setLinkUrl(editor.getAttributes("link").href ?? "");
            setLinkOpen(!linkOpen);
          }}
        >
          <Link2 size={18} />
        </button>
        <button
          type="button"
          aria-label="Remove link"
          disabled={!editor.isActive("link")}
          onClick={() =>
            editor.chain().focus().extendMarkRange("link").unsetLink().run()
          }
        >
          <Unlink size={18} />
        </button>
        <button
          type="button"
          aria-label="Clear formatting"
          onClick={() =>
            editor
              .chain()
              .focus()
              .unsetAllMarks()
              .clearNodes()
              .unsetTextAlign()
              .run()
          }
        >
          <RemoveFormatting size={18} />
        </button>
        <button
          type="button"
          aria-label="Undo"
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 size={18} />
        </button>
        <button
          type="button"
          aria-label="Redo"
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 size={18} />
        </button>
        <button
          type="button"
          disabled={busy}
          aria-label="Insert image"
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={18} />
        </button>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => void insertImage(e.target.files?.[0])}
        />
      </div>
      {linkOpen && (
        <div className="editor-link-panel">
          <label>
            Link URL
            <input
              type="url"
              placeholder="https://example.com"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              const href = safeUrl(linkUrl);
              if (!href) {
                setMessage("Enter a full http:// or https:// link.");
                return;
              }
              editor
                .chain()
                .focus()
                .extendMarkRange("link")
                .setLink({ href })
                .run();
              setLinkOpen(false);
              setMessage("");
            }}
          >
            Apply link
          </button>
          <button type="button" onClick={() => setLinkOpen(false)}>
            Cancel
          </button>
        </div>
      )}
      <EditorContent editor={editor} />
      {editor.isActive("image") && (
        <label className="image-alt">
          Image description (alt text)
          <input
            value={editor.getAttributes("image").alt ?? ""}
            onChange={(e) =>
              editor
                .chain()
                .updateAttributes("image", { alt: e.target.value })
                .run()
            }
          />
        </label>
      )}
      {busy && <p className="notice">Preparing and uploading image…</p>}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
