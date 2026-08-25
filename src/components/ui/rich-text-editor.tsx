"use client";

import { useEffect } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Button, Tooltip } from "@heroui/react";
import {
  Bold,
  Italic,
  Underline,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link2,
  Link2Off,
  Redo2,
  Undo2,
} from "lucide-react";
import { toRichTextHtml } from "@/lib/rich-text";

interface ToolbarButtonProps {
  label: string;
  icon: React.ReactNode;
  isActive?: boolean;
  isDisabled?: boolean;
  onPress: () => void;
}

function ToolbarButton({ label, icon, isActive, isDisabled, onPress }: ToolbarButtonProps) {
  return (
    <Tooltip content={label} delay={400} closeDelay={0}>
      <Button
        isIconOnly
        size="sm"
        radius="sm"
        variant={isActive ? "flat" : "light"}
        color={isActive ? "primary" : "default"}
        isDisabled={isDisabled}
        aria-label={label}
        aria-pressed={isActive}
        onPress={onPress}
      >
        {icon}
      </Button>
    </Tooltip>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const promptForLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Link URL", previous ?? "https://");
    if (href === null) return;
    if (href.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-default-200 px-1 py-1">
      <ToolbarButton
        label="Bold" icon={<Bold size={16} />}
        isActive={editor.isActive("bold")}
        onPress={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        label="Italic" icon={<Italic size={16} />}
        isActive={editor.isActive("italic")}
        onPress={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        label="Underline" icon={<Underline size={16} />}
        isActive={editor.isActive("underline")}
        onPress={() => editor.chain().focus().toggleUnderline().run()}
      />

      <div className="mx-1 h-5 w-px bg-default-200" />

      <ToolbarButton
        label="Heading" icon={<Heading2 size={16} />}
        isActive={editor.isActive("heading", { level: 2 })}
        onPress={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        label="Subheading" icon={<Heading3 size={16} />}
        isActive={editor.isActive("heading", { level: 3 })}
        onPress={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      />

      <div className="mx-1 h-5 w-px bg-default-200" />

      <ToolbarButton
        label="Bulleted list" icon={<List size={16} />}
        isActive={editor.isActive("bulletList")}
        onPress={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        label="Numbered list" icon={<ListOrdered size={16} />}
        isActive={editor.isActive("orderedList")}
        onPress={() => editor.chain().focus().toggleOrderedList().run()}
      />

      <div className="mx-1 h-5 w-px bg-default-200" />

      <ToolbarButton
        label="Add link" icon={<Link2 size={16} />}
        isActive={editor.isActive("link")}
        onPress={promptForLink}
      />
      <ToolbarButton
        label="Remove link" icon={<Link2Off size={16} />}
        isDisabled={!editor.isActive("link")}
        onPress={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
      />

      <div className="ml-auto flex items-center gap-0.5">
        <ToolbarButton
          label="Undo" icon={<Undo2 size={16} />}
          isDisabled={!editor.can().undo()}
          onPress={() => editor.chain().focus().undo().run()}
        />
        <ToolbarButton
          label="Redo" icon={<Redo2 size={16} />}
          isDisabled={!editor.can().redo()}
          onPress={() => editor.chain().focus().redo().run()}
        />
      </div>
    </div>
  );
}

interface RichTextEditorProps {
  label?: string;
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

/**
 * Rich-text field for product copy. Emits HTML, which is sanitised server-side
 * before it is stored (see src/lib/rich-text.ts) — never trust what arrives here.
 */
export function RichTextEditor({
  label,
  value,
  onChange,
  placeholder = "Write a description...",
  minHeight = 200,
}: RichTextEditorProps) {
  const editor = useEditor({
    // Tiptap warns and risks a hydration mismatch if it renders during SSR.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true },
      }),
    ],
    content: toRichTextHtml(value),
    editorProps: {
      attributes: {
        class: "rich-text-content max-w-none px-3 py-2 focus:outline-none",
        style: `min-height:${minHeight}px`,
      },
    },
    onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
  });

  // The edit page mounts before its product has loaded, so `value` arrives late.
  // Only push it in when it genuinely differs, or every keystroke would round-trip
  // through setContent and the caret would jump to the end of the document.
  useEffect(() => {
    if (!editor) return;
    const incoming = toRichTextHtml(value);
    if (incoming !== editor.getHTML()) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
  }, [value, editor]);

  return (
    <div className="w-full">
      {label && (
        <label className="mb-1.5 block text-sm text-foreground-600">{label}</label>
      )}
      <div className="rounded-medium border border-default-200 bg-default-100 focus-within:border-default-400">
        {editor && <Toolbar editor={editor} />}
        <div className="relative">
          {editor?.isEmpty && (
            <span className="pointer-events-none absolute left-3 top-2 text-sm text-foreground-400">
              {placeholder}
            </span>
          )}
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
