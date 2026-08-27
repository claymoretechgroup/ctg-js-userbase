// Dependency: React state, callback, refs, and lifecycle primitives.
import { useCallback, useEffect, useRef, useState } from "react";
// Dependency: public client error for operation configuration failures.
import ClientError from "../core/ClientError.js";

export type Operation<Args, Result> = (args: Args) => Promise<Result>;

export interface OperationHandle<Args, Result> {
    run(args: Args): Promise<void>;
    readonly pending: boolean;
    readonly result: Result | null;
    readonly error: ClientError | null;
}

interface OperationState<Result> {
    pending: boolean;
    result: Result | null;
    error: ClientError | null;
}

// HOOK :: (Args -> PROMISE(Result)) -> OperationHandle
// Runs a promise-returning operation with last-result-wins state exposure.
export default function useOperation<Args, Result>(operation: Operation<Args, Result>): OperationHandle<Args, Result> {
    if (typeof operation !== "function") {
        const error = new ClientError("CONFIGURATION_INVALID");
        (error as ClientError & { details: Record<string, unknown> }).details = { field: "operation" };
        throw error;
    }

    const mounted = useRef(true);
    const generation = useRef(0);
    const [state, setState] = useState<OperationState<Result>>({
        pending: false,
        result: null,
        error: null,
    });

    useEffect(() => () => {
        mounted.current = false;
    }, []);

    const run = useCallback(async (args: Args) => {
        generation.current += 1;
        const currentGeneration = generation.current;

        if (mounted.current) {
            setState((previous) => ({
                pending: true,
                result: previous.result,
                error: null,
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
                    error: error as ClientError,
                }));
            }
        }
    }, [operation]);

    return {
        run,
        pending: state.pending,
        result: state.result,
        error: state.error,
    };
}

export { useOperation };
