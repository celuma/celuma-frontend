import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import ActionButtonPanel, { type ActionButtonItem } from "./action_button_panel";

type Props = {
    current: number;
    pageSize: number;
    total: number;
    onChange: (page: number) => void;
};

/**
 * Build the windowed list of page tokens: always show first & last, the current
 * page with its neighbours, and collapse the rest into "…" ellipsis.
 * For 7 pages or fewer, show them all.
 */
function getPageList(current: number, totalPages: number): Array<number | "ellipsis"> {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: Array<number | "ellipsis"> = [1];
    const left = Math.max(2, current - 1);
    const right = Math.min(totalPages - 1, current + 1);
    if (left > 2) pages.push("ellipsis");
    for (let p = left; p <= right; p++) pages.push(p);
    if (right < totalPages - 1) pages.push("ellipsis");
    pages.push(totalPages);
    return pages;
}

/**
 * CelumaPagination — a fully Céluma-owned pagination control built on top of
 * `ActionButtonPanel`: a single segmented pill holding the previous arrow, the
 * page numbers (active page rendered as a solid teal anchor, overflow collapsed
 * to "…"), and the next arrow. No antd pagination markup involved.
 */
export default function CelumaPagination({ current, pageSize, total, onChange }: Props) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const pages = getPageList(current, totalPages);

    const actions: ActionButtonItem[] = [
        {
            icon: <LeftOutlined />,
            tooltip: "Página anterior",
            ariaLabel: "Página anterior",
            disabled: current <= 1,
            onClick: () => onChange(current - 1),
        },
        { divider: true },
        ...pages.map<ActionButtonItem>((page) =>
            page === "ellipsis"
                ? { label: "…", disabled: true }
                : {
                      label: String(page),
                      active: page === current,
                      ariaLabel: `Página ${page}`,
                      onClick: () => onChange(page),
                  }
        ),
        { divider: true },
        {
            icon: <RightOutlined />,
            tooltip: "Página siguiente",
            ariaLabel: "Página siguiente",
            disabled: current >= totalPages,
            onClick: () => onChange(current + 1),
        },
    ];

    return <ActionButtonPanel actions={actions} autoDividers={false} />;
}
