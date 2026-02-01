import { Layout } from "antd";
import AuthHeader from "./auth_header";
import { tokens } from "../design/tokens";

type Props = {
    children: React.ReactNode;
    activeLink?: "login" | "register";
};

export default function AuthLayout({ children, activeLink }: Props) {
    return (
        <Layout style={{ minHeight: "100vh", background: tokens.bg }}>
            <AuthHeader activeLink={activeLink} />
            <Layout.Content
                style={{
                    background: tokens.bg,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    padding: "16px",
                    minHeight: "calc(100vh - 64px)",
                    overflowY: "auto",
                }}
            >
                {children}
            </Layout.Content>
        </Layout>
    );
}
