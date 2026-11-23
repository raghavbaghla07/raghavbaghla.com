import { Editor, Mark, Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { legacyToDoc, safeLink } from '../lib/article';
export function createArticleEditor(element: HTMLElement, changed: () => void, imageUrl: (path: string) => Promise<string>) {
    const ArticleImage = Node.create({
        name: 'articleImage', group: 'block', atom: true, draggable: true,
        addAttributes() { return { path: { default: '' }, alt: { default: '' }, caption: { default: '' } }; },
        renderHTML({ HTMLAttributes }) { return ['figure', mergeAttributes(HTMLAttributes, { 'data-article-image': '' })]; },
        addNodeView() {
            return ({ node }) => {
                const dom = document.createElement('figure');
                dom.className = 'editor-image';
                const img = document.createElement('img');
                img.alt = String(node.attrs.alt || '');
                const caption = document.createElement('figcaption');
                caption.textContent = String(node.attrs.caption || '');
                dom.append(img, caption);
                void imageUrl(String(node.attrs.path)).then(url => { img.src = url; }).catch(() => { caption.textContent = 'Image preview unavailable. Your attachment is still saved.'; });
                return { dom };
            };
        },
    });
    function scriptMark(name: string, tag: string, excludes: string) {
        return Mark.create({
            name, excludes,
            parseHTML: () => [{ tag }],
            renderHTML: () => [tag, 0],
        });
    }
    return new Editor({
        element,
        extensions: [
            StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: { openOnClick: false, protocols: ['http', 'https', 'mailto'], isAllowedUri: url => safeLink(url) !== null } }),
            scriptMark('superscript', 'sup', 'subscript'), scriptMark('subscript', 'sub', 'superscript'),
            Highlight, TableKit.configure({ table: { resizable: false } }),
            Placeholder.configure({ placeholder: 'Start your story. Use the toolbar or familiar keyboard shortcuts.' }), ArticleImage,
        ],
        content: legacyToDoc(''),
        editorProps: { attributes: { class: 'article-content article-editor', role: 'textbox', 'aria-label': 'Article body', 'aria-multiline': 'true', spellcheck: 'true' } },
        onUpdate: changed,
    });
}
