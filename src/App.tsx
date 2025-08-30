import Login from "./pages/login";

function App() {
    return <Login />;
}
export default App;

/*
Link is like an <a> (link), but special to React.
It's used to navigate between pages without reloading the entire app.

import { Link, Outlet } from 'react-router-dom'
export default function App() {
    return (
        <>
            <nav style = {{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <Link to = "/"> Home </Link>
                <Link to = "/health"> Health </Link>
            </nav>
            <Outlet />
        </>
    )
}
*/