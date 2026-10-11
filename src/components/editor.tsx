"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Heading2,
  List,
  Quote,
  Undo2,
  Redo2,
  ImagePlus,
} from "lucide-react";
import { useRef, useState } from "react";
import type { RichNode } from "@/lib/content";
import { uploadFile } from "@/lib/upload";
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
  const input = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
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
