import { describe, expect, it } from "vitest";
import { ShaderChunk } from "three";
import { installStableThreeShaderPatches } from "./ChessStage";

describe("installStableThreeShaderPatches", () => {
  it("removes dynamic vector indexing from the dispersion branch", () => {
    installStableThreeShaderPatches();

    expect(ShaderChunk.transmission_pars_fragment).toContain("float iorR = ior - halfSpread;");
    expect(ShaderChunk.transmission_pars_fragment).toContain(
      "transmittedLight.a = ( transmissionSampleR.a + transmissionSampleG.a + transmissionSampleB.a ) / 3.0;",
    );
    expect(ShaderChunk.transmission_pars_fragment).not.toContain("iors[ i ]");
    expect(ShaderChunk.transmission_pars_fragment).not.toContain("transmittedLight[ i ]");
    expect(ShaderChunk.transmission_pars_fragment).not.toContain("transmittance[ i ]");
    expect(ShaderChunk.transmission_pars_fragment).not.toContain("diffuseColor[ i ]");
  });
});
