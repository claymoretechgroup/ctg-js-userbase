// Binds transport requests to the browser fetch operation.
export default class FetchTransport {

    // CONSTRUCTOR :: VOID -> this
    // Creates a fetch-backed transport.
    constructor() {}

    /**
     *
     * Instance Methods
     *
     */

    // :: Request -> PROMISE(Response)
    // Sends one request and returns raw response text for any HTTP status.
    async send(request) {
        const response = await fetch(request.url, {
            method: request.method,
            headers: request.headers,
            body: request.body,
            credentials: request.credentials
        });

        return {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            body: await response.text()
        };
    }
}

export { FetchTransport };
