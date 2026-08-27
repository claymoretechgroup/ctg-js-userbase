import React from "react";
import { createRoot } from "react-dom/client";
import {
    Authentication,
    CTGUserClient,
    DateClock,
    FetchTransport,
    UserbaseProvider
} from "ctg-js-userbase";
import App from "./App.jsx";
import "./styles.css";

const client = new CTGUserClient({
    base_url: "",
    transport: new FetchTransport(),
    clock: new DateClock()
});

const auth = Authentication.init(client);

createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        <UserbaseProvider client={client}>
            <App auth={auth} />
        </UserbaseProvider>
    </React.StrictMode>
);
