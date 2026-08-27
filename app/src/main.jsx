import React from "react";
import { createRoot } from "react-dom/client";
import {
    Authentication,
    CTGUserbaseClient,
    CTGUserbaseUtil,
    UserbaseProvider
} from "ctg-js-userbase";
import App from "./App.jsx";
import "./styles.css";

const client = new CTGUserbaseClient({
    base_url: "",
    transport: CTGUserbaseUtil,
    clock: CTGUserbaseUtil
});

const auth = Authentication.init(client);

createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        <UserbaseProvider client={client}>
            <App auth={auth} />
        </UserbaseProvider>
    </React.StrictMode>
);
