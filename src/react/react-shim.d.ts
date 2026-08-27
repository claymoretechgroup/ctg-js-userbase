declare module "react" {
    export type ReactNode = unknown;

    export interface ReactElement {
        readonly type: unknown;
        readonly props: unknown;
        readonly key: string | number | null;
    }

    export type SetStateAction<State> = State | ((previous: State) => State);

    export type Dispatch<Action> = (action: Action) => void;

    export interface MutableRefObject<Value> {
        current: Value;
    }

    export interface Context<Value> {
        Provider(props: { value: Value; children?: ReactNode }): ReactElement | null;
    }

    export function createContext<Value>(defaultValue: Value): Context<Value>;

    export function useContext<Value>(context: Context<Value>): Value;

    export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;

    export function useState<State>(initialState: State | (() => State)): [State, Dispatch<SetStateAction<State>>];

    export function useRef<Value>(initialValue: Value): MutableRefObject<Value>;

    export function useCallback<Callback>(callback: Callback, deps: readonly unknown[]): Callback;
}

declare module "react/jsx-runtime" {
    import type { ReactElement, ReactNode } from "react";

    export const Fragment: (props: { children?: ReactNode }) => ReactElement | null;

    export function jsx(type: unknown, props: unknown, key?: string): ReactElement;

    export function jsxs(type: unknown, props: unknown, key?: string): ReactElement;
}

declare namespace JSX {
    type Element = import("react").ReactElement;

    interface IntrinsicElements {
        [elementName: string]: Record<string, unknown>;
    }
}
