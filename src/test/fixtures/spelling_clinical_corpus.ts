/**
 * Céluma 1.4 (#29 follow-up) — SYNTHETIC lexical quality corpus for the
 * clinical spelling supplement. Isolated words and short invented sentences
 * only: no report text, patient data or clinical meaning is implied, and
 * nothing here validates clinical correctness (the checker is spelling
 * assistance). The valid list is authored independently of the lexicon source
 * on purpose, includes inflected forms (gender and number) and words the
 * upstream dictionary already knows as controls, and is a reviewer-extendable
 * sample, not a complete terminology. Misspellings are typical typing errors:
 * missing/transposed/duplicated letters and missing or misplaced accents.
 */

/** Supplied by the owner as correctly written (celuma-engineering#29 manual acceptance). */
export const OWNER_EXAMPLES = ["inmunohistoquímicos", "histológicos", "negatividad"] as const;

/** Correctly written forms that must NOT be reported. */
export const VALID_FORMS: readonly string[] = [
    ...OWNER_EXAMPLES,
    // owner examples, other inflections
    "inmunohistoquímico", "inmunohistoquímica", "inmunohistoquímicas", "histológico", "histológica", "histológicas",
    "negatividades",
    // accentless forms that are genuine words (spelling assistance cannot judge them by context)
    "diagnostico", "biopsia", "diagnóstico", "diagnósticos",
    // pathological processes (singular / plural)
    "adenocarcinoma", "adenocarcinomas", "hiperplasia", "hiperplasias", "displasia", "displasias", "metaplasia",
    "atipia", "atrofia", "fibrosis", "necrosis", "apoptosis", "mitosis", "esclerosis", "ulceración", "ulceraciones",
    "inflamación", "inflamaciones", "infiltración", "calcificación", "calcificaciones", "hemorragia", "congestión",
    "edema", "isquemia", "queratinización", "granuloma", "granulomas", "absceso", "abscesos", "quiste", "quistes",
    // adjectives, gender and number
    "hiperplásico", "hiperplásica", "hiperplásicos", "hiperplásicas", "displásico", "neoplásico", "neoplásica",
    "neoplásicas", "necrótico", "necrótica", "necróticos", "atípico", "atípica", "atípicas", "pleomórfico",
    "pleomórficos", "hipercromático", "hipercromáticos", "citológico", "citológicos", "citológica", "citológicas",
    "metastásico", "metastásica", "benigno", "benigna", "benignos", "benignas", "maligno", "maligna", "malignos",
    "invasor", "invasora", "invasores", "invasivo", "invasiva", "infiltrante", "infiltrantes", "epitelial",
    "epiteliales", "estromal", "estromales", "mesenquimal", "linfoide", "linfoides", "papilar", "papilares",
    "glandular", "glandulares", "tubular", "tubulares", "quístico", "quística", "quísticos", "sólido", "sólida",
    "sólidos", "fibroso", "fibrosa", "fibrosos", "mucinoso", "mucinosa", "seroso", "serosa", "intraepitelial",
    "intraepiteliales", "perineural", "perivascular", "linfovascular", "mitótico", "mitóticos", "mitóticas",
    // tumours
    "carcinoma", "carcinomas", "sarcoma", "sarcomas", "linfoma", "linfomas", "melanoma", "melanomas", "leiomioma",
    "leiomiomas", "lipoma", "hemangioma", "papiloma", "teratoma", "mesotelioma", "meningioma", "schwannoma",
    "hepatocarcinoma", "colangiocarcinoma", "cistoadenoma", "metástasis", "micrometástasis",
    // histology / cytology / microscopy
    "histología", "histopatología", "histopatológico", "histopatológicos", "histoquímico", "histoquímica",
    "citología", "citopatológico", "morfología", "morfológico", "morfológicos", "macroscópico", "macroscópica",
    "microscópico", "microscópica", "microscópicos", "microscópicamente", "macroscópicamente", "inmunorreactividad",
    "inmunoexpresión", "inmunotinción", "positividad", "reactividad", "eosinófilo", "eosinófilos", "basófilo",
    "basófilos", "neutrófilo", "neutrófilos", "linfocito", "linfocitos", "plasmocito", "plasmocitos", "histiocito",
    "histiocitos", "macrófago", "macrófagos", "fibroblasto", "fibroblastos", "hepatocito", "hepatocitos",
    "melanocito", "melanocitos", "células", "célula", "celular", "celularidad", "hipercelularidad", "núcleo",
    "núcleos", "nucléolo", "nucléolos", "citoplasma", "cromatina", "estroma", "parénquima", "intersticio",
    "hematoxilina", "eosina", "tinción", "tinciones", "colágeno", "mucina", "hemosiderina", "queratina",
    // anatomy
    "endometrio", "endometrial", "miometrio", "cérvix", "cérvices", "exocérvix", "endocérvix", "ovario", "ovarios",
    "tiroides", "esófago", "duodeno", "yeyuno", "íleon", "apéndice", "vesícula", "hígado", "páncreas", "bazo",
    "riñón", "riñones", "uréter", "vejiga", "próstata", "testículo", "epidermis", "dermis", "pulmón", "pulmones",
    "bronquio", "bronquios", "alvéolo", "alvéolos", "pleura", "mediastino", "ganglio", "ganglios", "ganglionar",
    "encéfalo", "meninges", "laringe", "mucosa", "submucosa", "mucosas", "muscular", "serosa",
    // procedures and processing
    "escisión", "resección", "exéresis", "legrado", "conización", "mastectomía", "histerectomía", "colectomía",
    "gastrectomía", "tiroidectomía", "lobectomía", "nefrectomía", "prostatectomía", "colecistectomía",
    "apendicectomía", "linfadenectomía", "aspirado", "punción", "frotis", "impronta", "improntas", "parafina",
    "formalina", "fijación", "laminilla", "laminillas", "criostato", "congelación", "intraoperatorio",
    "transoperatorio", "quirúrgico", "quirúrgicos", "quirúrgica", "quirúrgicas", "márgenes", "margen",
    // gross description
    "blanquecino", "blanquecina", "grisáceo", "pardusco", "amarillento", "rojizo", "friable", "friables",
    "indurado", "indurada", "pediculado", "sésil", "encapsulado", "circunscrito", "espiculado", "puntiforme",
    "irregular", "irregulares", "milimétrico", "centimétrico", "multilobulado", "gelatinoso", "caseoso",
    // combining forms over a known word
    "hipotiroidismo", "hipertiroidismo", "inmunosupresión", "intravascular", "peritoneal", "retroperitoneal",
    "supraclavicular", "infraclavicular", "neovascularización", "poliposis", "pseudoquiste",
    "endocervical", "exocervical", "hematoquecia",
    // proper names of stains / systems (capitalised)
    "Giemsa", "Papanicolaou", "Gleason", "Breslow", "Bethesda", "Hodgkin", "Barrett", "Crohn", "Hashimoto",
    // reviewed acronyms of 4–5 letters, and unknown short ones the engine must treat as acronyms
    "PAAF", "BAAF", "ASCUS", "HSIL", "LSIL", "DCIS", "GIST",
    // capitalised / upper-case forms of ordinary words
    "Histológicos", "HISTOLÓGICOS", "Negatividad", "NEGATIVIDAD", "Adenocarcinoma", "ADENOCARCINOMA",
];

/** Misspellings that must be reported; `expected` must be among the first `rank` suggestions (default 1). */
export const WRONG_FORMS: ReadonlyArray<{ wrong: string; expected: string; rank?: number }> = [
    // accent-only errors on the owner's words and on common clinical words
    { wrong: "inmunohistoquimicos", expected: "inmunohistoquímicos" },
    { wrong: "histologicos", expected: "histológicos" },
    { wrong: "histologica", expected: "histológica" },
    { wrong: "celulas", expected: "células" },
    { wrong: "celula", expected: "célula" },
    { wrong: "metastasis", expected: "metástasis" },
    { wrong: "neoplasico", expected: "neoplásico" },
    { wrong: "hiperplasico", expected: "hiperplásico" },
    { wrong: "citologico", expected: "citológico" },
    { wrong: "microscopico", expected: "microscópico" },
    { wrong: "macroscopica", expected: "macroscópica" },
    { wrong: "angioinvasion", expected: "angioinvasión" },
    { wrong: "ulceracion", expected: "ulceración" },
    { wrong: "inflamacion", expected: "inflamación" },
    { wrong: "infiltracion", expected: "infiltración" },
    { wrong: "tincion", expected: "tinción" },
    { wrong: "reseccion", expected: "resección" },
    { wrong: "escision", expected: "escisión" },
    { wrong: "exeresis", expected: "exéresis" },
    { wrong: "nucleo", expected: "núcleo" },
    { wrong: "nucleos", expected: "núcleos" },
    { wrong: "parenquima", expected: "parénquima" },
    { wrong: "cervix", expected: "cérvix" },
    { wrong: "higado", expected: "hígado" },
    { wrong: "pancreas", expected: "páncreas" },
    { wrong: "riñon", expected: "riñón" },
    { wrong: "quirurgico", expected: "quirúrgico" },
    // letter-level typing errors
    { wrong: "negatibidad", expected: "negatividad" },
    { wrong: "negatvidad", expected: "negatividad" },
    { wrong: "adenocarcinoam", expected: "adenocarcinoma" },
    { wrong: "adenocarsinoma", expected: "adenocarcinoma" },
    { wrong: "histolgico", expected: "histológico" },
    { wrong: "hiperplacia", expected: "hiperplasia" },
    { wrong: "displacia", expected: "displasia" },
    { wrong: "metaplacia", expected: "metaplasia" },
    { wrong: "pleomorfizmo", expected: "pleomorfismo" },
    { wrong: "carcinom", expected: "carcinoma" },
    { wrong: "carsinoma", expected: "carcinoma" },
    { wrong: "linfocitoss", expected: "linfocitos" },
    { wrong: "mitosiss", expected: "mitosis" },
    { wrong: "fibrosiss", expected: "fibrosis" },
    { wrong: "necrosiss", expected: "necrosis" },
    { wrong: "pacietne", expected: "paciente" },
    { wrong: "hallasgos", expected: "hallazgos" },
    { wrong: "diagnostco", expected: "diagnóstico", rank: 2 },
    { wrong: "biopcia", expected: "biopsia" },
    { wrong: "epitelail", expected: "epitelial" },
    { wrong: "estromla", expected: "estromal", rank: 2 },
    { wrong: "ganglionr", expected: "ganglionar" },
];

/** Wrong forms that no sensible lexicon should accept, with no expectation on the suggestion. */
export const MUST_STAY_WRONG: readonly string[] = [
    "adenocarcinoam", "histolgico", "inmunohistoquimicos", "hiperplacia", "xqzwvk", "hipercelularidadd",
    "inmunohistoquimico", "neoplasiaa", "carcinomaas", "histologcios", "epitelail", "histoquimicos",
    "hipertiroidimo", "intravasculer", "supraclavicualr", "peritonela", "TUMRO", "CARCINOAM", "BIOPSAI",
];

/** Invented sentences made of valid words only: none of their words may be reported. */
export const VALID_SENTENCES: readonly string[] = [
    "Los hallazgos histológicos muestran negatividad para marcadores inmunohistoquímicos.",
    "Se observa hiperplasia glandular con atipia leve y escasas mitosis.",
    "Fragmentos de mucosa con inflamación crónica y focos de metaplasia intestinal.",
    "Adenocarcinoma moderadamente diferenciado con invasión perineural y linfovascular.",
    "Márgenes quirúrgicos libres de neoplasia; ganglios regionales sin metástasis.",
    "Núcleos pleomórficos e hipercromáticos con nucléolos prominentes y citoplasma eosinófilo.",
    "Estroma fibroso con infiltrado linfoplasmocitario y escasos neutrófilos.",
    "Tinción de hematoxilina y eosina; los cortes seriados se revisaron en el criostato.",
    "Lesión nodular, blanquecina y firme, de bordes irregulares, sin necrosis macroscópica.",
    "Citología compatible con ASCUS; se sugiere correlación con PAAF y estudio inmunohistoquímico.",
    "Epitelio escamoso con paraqueratosis, acantosis y espongiosis focal.",
    "Células de aspecto histiocitario con citoplasma espumoso y núcleos vesiculares.",
];

/**
 * Documented limits, asserted so they cannot change silently:
 * - valid clinical words the supplement does not contain yet (the lexicon is a proposal, not a complete terminology);
 * - wrong forms the UPSTREAM dictionary itself accepts (its data, not ours).
 */
export const KNOWN_GAPS: readonly string[] = ["hepatoesplénico", "esplenomegalia"];
export const KNOWN_UPSTREAM_ACCEPTED_WRONG_FORMS: readonly string[] = ["margenes"];
