import { useId } from "react";
import { Checkbox as AntCheckbox } from "antd";
import type { CheckboxProps } from "antd";

type Props = CheckboxProps & {
    label?: string;
};

export default function Checkbox({ label, style, ...rest }: Props) {
    const uid = useId();
    return (
        <label
            className={`cb-${uid}`}
            style={{
                display: "inline-flex",
                alignItems: "center",
                marginTop: 10,
                gap: 8,
                fontSize: 14,
                color: "#0d1b2a",
                cursor: "pointer",
                ...style,
            }}
        >
            <style>{`
                .cb-${uid} .ant-checkbox .ant-checkbox-inner {
                  width: 18px;
                  height: 18px;
                  border: 2px solid #0f8b8d !important;
                  border-radius: 4px;
                }

                .cb-${uid} .ant-checkbox:hover .ant-checkbox-inner {
                  border-color: #0c6f71 !important;
                }

                .cb-${uid} .ant-checkbox-checked .ant-checkbox-inner {
                  background-color: #0f8b8d !important;
                  border-color: #0f8b8d !important;
                }

                .cb-${uid} .ant-checkbox-checked .ant-checkbox-inner::after {
                  border-color: #fff !important;
                }
        
                .cb-${uid} .ant-checkbox + span {
                  margin-left: 8px;
                  color: #0d1b2a;
                  font-size: 14px;
                }
            `}</style>

            <AntCheckbox {...rest}>{label}</AntCheckbox>
        </label>
    );
}
