# 3D pipeline
The heart is **procedural** (no downloaded mesh, so no licence issues): `components3d/HeartModel/anatomy.js` builds
- a conical ventricular surface with anterior/posterior interventricular grooves and an AV sulcus (RV flatter, LV bulging),
  vertex-coloured muscle with yellow epicardial fat along the grooves;
- left/right atria and auricles, aortic arch with 3 branches, pulmonary trunk + left/right pulmonary arteries, SVC,
  two pulmonary veins.
`VesselInteraction/vessels.js` defines the LAD, LCX and RCA **trees** (main trunk + branches: diagonals, obtuse marginals,
acute marginal, posterior descending) as splines whose points are (cos theta, phi) coordinates ON the ventricular surface,
so they follow the grooves. Each tree is one selectable, separately coloured group of tapered tubes.

Colour = `probabilityToColor(p)` (green -> amber -> red), shared with the dashboard cards.
Overall CAD is shown as a translucent glow shell around the heart + a probability badge; the arteries only ever show
their own vessel's probability (grey "n/a" when that vessel has no trained model).
The heartbeat is cosmetic and is not tied to any patient value.

Honest limits: the anatomy is stylised, not a patient-specific or BodyParts3D mesh; coronary radii are exaggerated
(x1.7) so they are visible and clickable; artery paths are schematic.

Swapping in a real mesh (BodyParts3D / Sketchfab .glb - check the licence and credit it): replace the `ventricles`
mesh and `buildStatic()` parts with `useGLTF("/heart.glb")`, then re-fit the (cos theta, phi) control points in
`vessels.js` (or name separate meshes LAD/LCX/RCA in Blender and map them by name).
Performance: about 20k triangles in total, device pixel ratio capped at 1.5, no shadows or post-processing.

## Interactive layers (added)
`veins.js` / `Veins.jsx` (great cardiac vein, middle cardiac vein, coronary sinus) and `conduction.js` / `Conduction.jsx`
(SA node, AV node, His bundle, bundle branches, Purkinje fibres) use the same surface coordinates as the arteries.
`structures.json` is the catalogue shown by hover and the inspector; every measurement it links is a real dataset column
(checked by `tests/test_structures.py`). Veins and conduction are off by default and switch on when selected.
