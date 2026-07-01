import { Switch, ConfigProvider } from "antd";
import type { SwitchProps } from "antd";
import { tokens } from "../design/tokens";

/**
 * CelumaSwitch — antd `Switch` themed teal (instead of antd's default blue) via a
 * scoped ConfigProvider, so toggles speak the Céluma brand language everywhere.
 */
export default function CelumaSwitch(props: SwitchProps) {
    return (
        <ConfigProvider
            theme={{
                token: { colorPrimary: tokens.primary },
                components: { Switch: { colorPrimary: tokens.primary, colorPrimaryHover: "#3da8a0" } },
            }}
        >
            <Switch {...props} />
        </ConfigProvider>
    );
}
