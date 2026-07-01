import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { tokens } from "../design/tokens";

type Props = {
    value: string;
    onChange: (html: string) => void;
    readOnly?: boolean;
    placeholder?: string;
    /** Quill modules (toolbar config…). Defaults to a Céluma-friendly rich toolbar. */
    modules?: Record<string, unknown>;
    /** Min height of the editor area. */
    minHeight?: number;
};

const DEFAULT_MODULES = {
    toolbar: {
        container: [
            [{ header: [1, 2, 3, false] }],
            ["bold", "italic", "underline"],
            [{ list: "ordered" }, { list: "bullet" }],
            ["link"],
            ["clean"],
        ],
    },
};

/**
 * CelumaRichText — ReactQuill (snow) re-skinned to the Céluma language so the
 * rich-text editor stops looking like raw Quill: 2px neutral outline that turns
 * teal on focus with a soft ring, a rounded tinted toolbar whose buttons light up
 * teal on hover/active, brand typography and a comfortable editor area. 100%
 * reusable wherever rich text is edited (report sections, templates, …).
 */
export default function CelumaRichText({
    value,
    onChange,
    readOnly = false,
    placeholder,
    modules = DEFAULT_MODULES,
    minHeight = 140,
}: Props) {
    return (
        <div className="celuma-quill">
            <style>{`
                .celuma-quill { border-radius: 12px; }
                .celuma-quill .ql-toolbar.ql-snow {
                    border: 2px solid #e5e7eb;
                    border-bottom: 1px solid #eef1f0;
                    border-radius: 12px 12px 0 0;
                    background: #fafbfc;
                    padding: 8px 10px;
                    font-family: ${tokens.textFont};
                }
                .celuma-quill .ql-container.ql-snow {
                    border: 2px solid #e5e7eb;
                    border-top: none;
                    border-radius: 0 0 12px 12px;
                    font-family: ${tokens.textFont};
                    font-size: 14px;
                    background: #fff;
                }
                .celuma-quill:focus-within .ql-toolbar.ql-snow,
                .celuma-quill:focus-within .ql-container.ql-snow {
                    border-color: ${tokens.primary};
                }
                .celuma-quill:focus-within { box-shadow: 0 0 0 4px ${tokens.primary}1a; }
                .celuma-quill .ql-editor {
                    min-height: ${minHeight}px;
                    color: ${tokens.textPrimary};
                    line-height: 1.6;
                }
                .celuma-quill .ql-editor.ql-blank::before {
                    color: #9ca3af;
                    font-style: normal;
                }
                /* Toolbar buttons — neutral at rest, teal on hover/active */
                .celuma-quill .ql-snow.ql-toolbar button,
                .celuma-quill .ql-snow .ql-picker-label {
                    border-radius: 6px;
                    transition: background .15s ease;
                }
                .celuma-quill .ql-snow .ql-stroke { stroke: #6b7280; }
                .celuma-quill .ql-snow .ql-fill { fill: #6b7280; }
                .celuma-quill .ql-snow .ql-picker { color: #6b7280; }
                .celuma-quill .ql-snow.ql-toolbar button:hover,
                .celuma-quill .ql-snow.ql-toolbar button.ql-active {
                    background: ${tokens.primary}1a;
                }
                .celuma-quill .ql-snow.ql-toolbar button:hover .ql-stroke,
                .celuma-quill .ql-snow.ql-toolbar button.ql-active .ql-stroke,
                .celuma-quill .ql-snow .ql-picker-label:hover .ql-stroke,
                .celuma-quill .ql-snow .ql-picker-label.ql-active .ql-stroke {
                    stroke: ${tokens.primary};
                }
                .celuma-quill .ql-snow.ql-toolbar button:hover .ql-fill,
                .celuma-quill .ql-snow.ql-toolbar button.ql-active .ql-fill {
                    fill: ${tokens.primary};
                }
                .celuma-quill .ql-snow .ql-picker-label:hover,
                .celuma-quill .ql-snow .ql-picker-item:hover,
                .celuma-quill .ql-snow .ql-picker-item.ql-selected {
                    color: ${tokens.primary};
                }
                .celuma-quill .ql-snow .ql-picker-options {
                    border-radius: 10px;
                    border: 1px solid #eef1f0;
                    box-shadow: ${tokens.shadow};
                    padding: 4px;
                }
                .celuma-quill .ql-snow a { color: ${tokens.primary}; }
            `}</style>
            <ReactQuill
                theme="snow"
                value={value}
                onChange={onChange}
                readOnly={readOnly}
                placeholder={placeholder}
                modules={modules}
            />
        </div>
    );
}
