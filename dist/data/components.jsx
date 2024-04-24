import { onCleanup, onMount, splitProps } from "solid-js";
import { routableForms } from "./action.js";
export function Form(props) {
    const [, rest] = splitProps(props, ["ref"]);
    onMount(() => {
        routableForms.add(formRef);
    });
    onCleanup(() => routableForms.delete(formRef));
    let formRef;
    return <form {...rest} ref={(el) => {
            props.ref && props.ref(el);
            formRef = el;
        }}/>;
}
