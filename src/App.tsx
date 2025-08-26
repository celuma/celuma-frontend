import { Link, Outlet } from 'react-router-dom'

export default function App() {
    return (
        <>
            <nav style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <Link to="/">Home</Link>
                <Link to="/health">Health</Link>
            </nav>
            <Outlet />
        </>
    )
}