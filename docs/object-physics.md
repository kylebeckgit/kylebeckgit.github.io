# Scoping a real physics object view

The stylized Object view draws textbook mode shapes for the body the preview already chose. This note scopes a later step that would solve those modes from the shape, instead of looking them up. Nothing here is built. Times that were not measured in this repo are marked as estimates and given a source.

## What would have to be true

The picture and the sound are one object today because both read the same partial list. A solver only stays honest if its frequencies and mode shapes become that list, or if the view is clearly labeled as a picture that is not what you hear. Driving synthesis means the solver output replaces `previewPartials` for that gesture: ratios, gains, and decays. A view-only solve can sit beside the current synth and must not pretend to be it.

## Approaches

1. **Keep the stylized view.** No solve. This is what shipped. It is the right default on a phone.
2. **2D membrane or plate eigenproblem in JavaScript.** A drawn outline becomes a triangle mesh. Linear elements build a stiffness matrix and a lumped mass matrix, then a subspace iteration returns the lowest modes. [Eigendrum](https://baselashraf.com/work/eigendrum.html) does this for a drum and feeds the eigenvalues to the Web Audio API. It reports about 800 ms for 2,051 unknowns, in a worker, with no WASM and no server. That number is theirs, on an unspecified desktop browser, not a measurement from this repo.
3. **WASM structural solver.** [Hekatan](https://github.com/GiorgioBurbanelli89/hekatan-struct) compiles a C++ Eigen modal solver to WASM and checks beams, plates, and shells against SAP2000. [KoFEM](https://github.com/mkofler96/KoFEM) runs STEP, meshing, and MFEM in the browser and publishes a compiled engine of about 34 MB. [WebCAE](https://www.webcae.com/en) says its browser WASM path handles on the order of 150,000 to 300,000 degrees of freedom. Those are vendor or author claims, not timings from this preview.
4. **WebGPU compute.** Safari 26 ships WebGPU on iPhone and iPad ([WebKit, September 2025](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/); [Can I use](https://caniuse.com/webgpu)). Older iOS releases had it off or missing. A sparse eigen-solve is a poor first WebGPU project: the useful part is still the mesh and the matrix, and the phone Kyle is on may not be on iOS 26.

## Time, memory, and bundle

| Path | What is known | What is only an estimate |
| --- | --- | --- |
| Stylized canvas | Draws in the page’s existing 2D canvas. No extra library. | Not a solve. |
| 2D mesh, about 2,000 unknowns | Eigendrum: about 800 ms, pure JS, desktop browser. | On an iPhone, expect several times that if the same algorithm runs on the CPU. Not measured here. A worker keeps the page from locking, but the wait is still noticeable. |
| 3D shell or solid, tens of thousands of degrees of freedom | WebCAE claims the browser can reach the low hundreds of thousands of DOF. KoFEM’s engine download is about 34 MB. | A first acoustic shell mesh for a bell is likely seconds on a laptop and uncomfortable on a phone. Not measured here. |
| WebGPU | Available in Safari on iOS 26. | No public acoustic modal benchmark was found for iPhone WebGPU. Do not plan on it for the first version. |

Memory for a 2,000-unknown lumped eigenproblem is a few dense vectors plus a sparse matrix. That fits a phone. A 34 MB WASM engine does not belong in the first load of this preview.

## Staying in sync with what is heard

If the button says the shape was simulated, the partial table, the 3D partials view, Hear, and the export should use those ratios and decays. Eigendrum already does the synthesis half for a membrane. For a bar, tube, plate, or bell, the same handoff is: write the solved ratios into the profile, set decays from a material loss factor (the solve does not know the mallet or the damping knobs), then let the existing renderer play them.

If the solve is only a picture, keep the current synth and label the picture as an illustration. Mixing the two without a label is how the view and the sound drift apart.

## Cost

Client-side JS or WASM is $0 of hosting, compute, and licensing if the solver is MIT, BSD, or similar and runs in the visitor’s browser. Eigen, used by Hekatan, is MPL2. MFEM, used by KoFEM, is BSD. No server, no GPU rental, no per-solve fee. A paid desktop FEA license is out of scope.

## Effort

This is a separate feature from the stylized view, not a polish pass.

- A 2D membrane or plate button, one mesh density, worker, and a write-back into the partial list, is one contained feature: mesher, solver, and a single handoff.
- Bars and tubes can stay on the textbook formulas they already use. Solving them adds little.
- A bell or a shell needs a 3D mesh and a much larger solver. That is a different project from the 2D button, and it is the one that pressures the phone.
- WebGPU does not remove the meshing or the need to check the answer against a known plate or disk.

## Recommendation

Leave the stylized Object view as what people see while they design. Add an optional **Simulate this shape** button later, desktop first, for a membrane or a plate only. Run it in a worker, show a sentence-case wait state, and on success replace the partials so Hear matches the picture. Skip it automatically on a phone, or offer it with a clear warning, until there is a measured iPhone time under a couple of seconds. Do not download a 30 MB engine for that button. Do not make the live knobs wait on a solve.
