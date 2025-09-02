import { Controller } from "react-hook-form";
import type { FieldValues, Control, Path, ControllerRenderProps } from "react-hook-form";
import type { ReactElement } from "react";

type RenderProps<T extends FieldValues> =
    ControllerRenderProps<T, Path<T>> & { error?: string };

type Props<T extends FieldValues> = {
    control: Control<T>;
    name: Path<T>;
    render: (p: RenderProps<T>) => ReactElement;
};

export default function FormField<T extends FieldValues>({control, name, render,}: Props<T>) {
    return (
        <Controller
            control = {control}
            name = {name}
            render = {({ field, fieldState }) =>
                render({ ...field, error: fieldState.error?.message } as RenderProps<T>)
            }
        />
    );
}
