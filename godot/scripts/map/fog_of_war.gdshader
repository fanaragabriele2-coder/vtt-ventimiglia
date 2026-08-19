shader_type canvas_item;

// Fog of War a DOPPIO CANALE (Fase 2 del Nexus Map Engine).
// La texture ha 1 texel per CELLA della griglia (48x36 px), upscalata con filtering lineare:
// e' l'upscale a creare i bordi di nebbia morbidi, gratis, senza geometria.
//   R = esplorato (memoria permanente)
//   G = visibile ORA (linea di vista corrente)
//   B = autoilluminato (bagliore della lava che filtra oltre la nebbia)
// Risultato: trasparente dove visibile, penombra dove solo esplorato, nero dove ignoto —
// con un alone rosso dove, oltre la nebbia, scorre un fiume di lava (lo senti prima di vederlo).

void fragment() {
	vec4 fog = texture(TEXTURE, UV);
	float visibile = fog.g;
	float esplorato = max(fog.r, visibile);
	float oscurita = 1.0 - max(visibile, esplorato * 0.45);
	vec3 bagliore_lava = vec3(0.35, 0.07, 0.02) * fog.b * (1.0 - visibile);
	COLOR = vec4(bagliore_lava, clamp(oscurita, 0.0, 1.0));
}
