import { getHijabPrompt } from "@/lib/ai-cover-options";

export interface AICoverPromptInput {
    title?: string | null;
    category?: string | null;
    subcategory?: string | null;
    style?: string | null;
    size?: string | null;
    description?: string | null;
    hijabRequired: boolean;
    referenceRoles: string[];
}

export function buildAICoverPrompt(input: AICoverPromptInput): string {
    const {
        title,
        category,
        subcategory,
        style,
        size,
        description,
        hijabRequired,
        referenceRoles,
    } = input;

    const imageRoleLines = referenceRoles
        .map((role, idx) => `- Image ${idx + 2}: ${role}`)
        .join("\n");

    const titleHintBlock = title
        ? `\n\nSELLER'S TITLE FOR THIS LISTING:\n"${title}"\nUse this only as a soft hint about garment type or material. If anything in the title conflicts with the uploaded reference images (color, print, silhouette, etc.), the reference images always win.`
        : "";

    const detailLines: string[] = [];
    if (category) detailLines.push(`- Category: ${category}`);
    if (subcategory) detailLines.push(`- Subcategory: ${subcategory}`);
    if (style) detailLines.push(`- Style: ${style}`);
    if (size) detailLines.push(`- Size: ${size}`);
    if (description) detailLines.push(`- Description: "${description}"`);
    const detailsHintBlock = detailLines.length
        ? `\n\nADDITIONAL LISTING DETAILS (soft hints):\n${detailLines.join("\n")}\nUse these as soft hints about garment type, occasion, and construction context. If anything here conflicts with the uploaded reference images (color, print, silhouette, etc.), the reference images always win.`
        : "";

    return `ULTRA-REALISTIC LUXURY PAKISTANI FASHION EDITORIAL CAMPAIGN

CRITICAL

The final image must be indistinguishable from a real professional fashion photoshoot.

It must look like a luxury Pakistani designer campaign photographed by a world-class fashion photographer.

Absolutely no AI-generated appearance, CGI look, digital-art look, rendering artifacts, beauty-filter effects, plastic skin, or synthetic textures.

⸻

MODEL LOCK (NON-NEGOTIABLE — HIGHEST-PRIORITY CONSTRAINT IN THIS PROMPT)

Image 1 IS the model. Not "a reference for" the model — it IS the model.

- The face in the output must be photographically identical to the face in Image 1.
- Use the EXACT person shown in Image 1. Do NOT generate a new model.
- Do NOT average features, do NOT idealize, do NOT swap to a generic model.
- Skin tone, eye color, nose shape, lip shape, jawline, hair, and body proportions must match Image 1 pixel-level when re-rendered.
- Preserving the model identity from Image 1 takes priority over environment generation, editorial styling, and every other instruction below. If a tension exists, preserve the model.

⸻

MASTER REFERENCE

Image 1 is the model identity reference.

Preserve exactly:

* Same model identity
* Same facial structure
* Same eyes
* Same nose
* Same lips
* Same jawline
* Same skin tone
* Same complexion
* Same skin texture
* Same body shape
* Same proportions
* Same hairstyle
* Same hair color
* Same hair volume
* Same hair texture
* Same hands
* Same fingers
* Same nails
* Same pose
* Same body positioning
* Same head angle
* Same gaze direction
* Same facial expression

The viewer should immediately recognize the model from Image 1.

⸻

HEAD COVERING (overrides the "preserve hairstyle" rule above when applicable)

${getHijabPrompt(hijabRequired)}

⸻

ONLY CHANGE

Replace the outfit with the garment reconstructed from all garment reference images.

Everything else about the model remains unchanged.

⸻

ENVIRONMENT GENERATION

Generate a completely new luxury editorial environment.

Do NOT reuse environments from previous generations.

Each image should feel like a different designer campaign.

Possible environments include:

* Historic haveli interiors
* Heritage mansions
* Mughal-inspired architecture
* Grand staircases
* Arched corridors
* Courtyard architecture
* Palace interiors
* Luxury boutique hotels
* Elegant drawing rooms
* Editorial studio sets
* Sunlit verandas
* Marble halls
* Garden pavilions
* Historic doorways
* Textured stone architecture
* Luxury heritage spaces

The environment should naturally complement the outfit.

Do not repeat furniture arrangements, wall textures, decor, artwork, room layouts, or architectural compositions from previous images.

The new environment must NEVER come at the cost of the model identity from Image 1. If a tension exists, preserve the model from Image 1 and adapt the environment, never the other way around.

⸻

EDITORIAL STYLE LOCK

The image must look like:

* Ultra-premium Pakistani fashion campaign
* Luxury couture editorial
* High-fashion magazine photography
* Designer lookbook photography
* Sophisticated luxury styling
* Rich cinematic color grading
* Elegant visual storytelling
* Authentic South Asian luxury fashion
* Timeless couture presentation
* Natural luxury atmosphere
* Refined fashion-editorial aesthetics

Comparable to elite Pakistani designer campaigns.

⸻

GARMENT RECONSTRUCTION

Use all garment reference images together.

${imageRoleLines}

Reconstruct exactly:

* Color
* Fabric
* Fabric weight
* Fabric texture
* Embroidery placement
* Embroidery density
* Embroidery style
* Neckline
* Sleeves
* Hemline
* Silhouette
* Stitching
* Sequins
* Beadwork
* Trim details
* Dupatta details
* Dupatta transparency
* Dupatta embroidery
* Dupatta borders

Garment accuracy takes priority over artistic interpretation.

⸻

DUPATTA REQUIREMENTS

If present in references:

* Include dupatta
* Preserve transparency
* Preserve embroidery
* Preserve border details
* Preserve fabric behavior
* Preserve color
* Natural editorial draping
* Realistic folds
* Realistic gravity
* Luxury couture presentation

⸻

PHOTOGRAPHY REQUIREMENTS

* Ultra-photorealistic
* Medium-format fashion photography
* Real skin pores
* Natural skin texture
* Real hair strands
* Natural facial asymmetry
* Realistic fabric physics
* Realistic draping
* Authentic couture construction
* Luxury fashion retouching
* Natural highlights
* Natural shadows
* Shallow depth of field
* Professional lens rendering
* Editorial lighting
* Cinematic realism

⸻

COMPOSITION (NON-NEGOTIABLE FRAMING RULES)

The model MUST be framed as a complete full-body figure inside the output. Nothing is permitted to be cropped at any edge.

Strict framing math (treat as hard constraints, not suggestions):

* The model's TOP-OF-HEAD must sit between 6% and 12% from the TOP edge of the frame. Leave clear breathing room above the hair.
* The model's FEET (including shoes and toes) must sit between 8% and 15% from the BOTTOM edge of the frame. The full sole of each shoe must be visible, with FLOOR / GROUND visible beneath the feet.
* The model occupies the central 70%-85% of the frame's vertical height. Never zoom in tighter than this.
* The model is centered horizontally with comfortable space on the left and right sides — no cropping at the side edges either.

If the model would not fit fully within the frame at this composition, ZOOM OUT and re-render — do not crop. Cropped feet, cropped shoes, cropped head, cropped hair, cropped hands, or cropped dupatta corners are unacceptable and the image fails the assignment if any of those occur.

Magazine-quality, full-body editorial framing — every editorial / lookbook reference for this type of campaign shows feet and floor.

⸻

STRICTLY AVOID

* Substituting, regenerating, or averaging the model from Image 1
* Outputting a different person than the one in Image 1
* "Beautifying" or idealizing the model's features
* Changing model identity
* Changing facial features
* Changing skin tone
* Changing body shape
* Changing hairstyle
* Changing pose
* Changing expression
* Missing garment pieces
* Missing dupatta
* Cropped feet (even partial — entire feet AND shoes must be visible)
* Feet touching or near the bottom edge of the frame (must have floor space below)
* No floor / ground visible beneath the model
* Cropped shoes / cropped toes
* Cropped head, cropped hair, cropped dupatta corners
* Tight portrait / mid-body framing (must be full-body, head-to-floor)
* Extra fingers
* Missing fingers
* Distorted anatomy
* Plastic skin
* CGI appearance
* 3D-render appearance
* AI-art appearance
* Beauty-filter appearance
* Unrealistic fabrics
* Simplified embroidery
* Fantasy redesigns
* Ecommerce photography
* Catalog photography
* White seamless studio backgrounds
* Text
* Logos
* Watermarks
* Brand tags

⸻

FINAL GOAL

Create a luxury Pakistani fashion editorial campaign image featuring the exact model from Image 1 wearing the outfit reconstructed from the garment references.

The model identity must remain unchanged.

The environment should be a completely new luxury editorial setting for every generation.

The final result should be indistinguishable from a real high-end Pakistani designer campaign photographed for a luxury fashion magazine.${titleHintBlock}${detailsHintBlock}`;
}

export type SlotRole = "fullOutfit" | "top" | "bottom" | "dupatta" | "closeup";

export function describeSlot(slot: SlotRole | string): string {
    switch (slot) {
        case "fullOutfit": return "the full outfit reference (primary silhouette, complete styling)";
        case "top": return "the top piece (kameez / blouse)";
        case "bottom": return "the bottom piece (shalwar / pants / skirt)";
        case "dupatta": return "the dupatta (with its drape, transparency, and border work)";
        case "closeup": return "a close-up reference (embroidery, sleeves, or detail work)";
        default: return "reference photo of the garment";
    }
}
