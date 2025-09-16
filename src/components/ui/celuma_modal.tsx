import React from "react";
import { Modal } from "antd";
import type { ModalProps } from "antd";
import { tokens } from "../design/tokens";

type Props = Omit<ModalProps, "title"> & {
    title?: React.ReactNode;
};

export default function CelumaModal({ title, children, styles, ...rest }: Props) {
    const headerStyle: React.CSSProperties = {
        fontFamily: tokens.titleFont,
        fontSize: 22,
        fontWeight: 800,
        margin: 0,
        color: "#0f8b8d",
    };

    return (
        <Modal
            {...rest}
            styles={{
                header: { padding: "18px 24px", borderBottom: "none" },
                content: {
                    borderRadius: tokens.radius,
                    boxShadow: tokens.shadow,
                    padding: 0,
                    overflow: "hidden",
                },
                body: { padding: 24, background: tokens.cardBg },
                footer: { padding: 16, background: tokens.cardBg },
                ...styles,
            }}
            title={title ? <h3 style={headerStyle}>{title}</h3> : null}
        >
            {children}
        </Modal>
    );
}


