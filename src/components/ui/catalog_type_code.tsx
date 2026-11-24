/**
 * Céluma 1.5 (#69): a study/sample type's code as a chip. The parentheses are
 * only hidden visually, so what a screen reader announces (and what is copied)
 * stays the plain label "Nombre (CÓDIGO)". Styles: catalog_type_select.css.
 */
export default function CatalogTypeCode({ className, code }: { className: string; code: string }) {
    return (
        <span className={className}>
            <span className="ct-sr"> (</span>
            {code}
            <span className="ct-sr">)</span>
        </span>
    );
}
