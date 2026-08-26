// Dependency: React state, callback, refs, and lifecycle primitives.
import { useCallback, useEffect, useRef, useState } from "react";
// Dependency: public client error for operation configuration failures.
import ClientError from "../core/ClientError.js";

// HOOK :: (Args -> PROMISE(Result)) -> OperationHandle
// Runs a promise-returning operation with last-result-wins state exposure.
export default function useOperation(operation) {
    if (typeof operation !== "function") {
        const error = new ClientError("CONFIGURATION_INVALID");
        error.details = { field: "operation" };
        throw error;
    }

    const mounted = useRef(true);
    const generation = useRef(0);
    const [state, setState] = useState({
        pending: false,
        result: null,
        error: null
    });

    useEffect(() => () => {
        mounted.current = false;
    }, []);

    const run = useCallback(async (args) => {
        generation.current += 1;
        const currentGeneration = generation.current;

        if (mounted.current) {
            setState((previous) => ({
                pending: true,
                result: previous.result,
                error: null
            }));
        }

        try {
            const result = await operation(args);
            if (mounted.current && generation.current === currentGeneration) {
                setState({ pending: false, result, error: null });
            }
        } catch (error) {
            if (mounted.current && generation.current === currentGeneration) {
                setState((previous) => ({
                    pending: false,
                    result: previous.result,
                    error
                }));
            }
        }
    }, [operation]);

    return {
        run,
        pending: state.pending,
        result: state.result,
        error: state.error
    };
}

export { useOperation };
