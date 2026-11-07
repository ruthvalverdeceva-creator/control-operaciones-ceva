/* ==========================================================================
   LECTURA DE TUS EXCEL (MARA, DRIVE, STOCK ENTREGAS, PICKING, USUARIOS)
   Recibe las filas de la hoja (primera fila = encabezados) y devuelve filas listas
   para guardar. Reconoce las columnas por su NOMBRE, no por su posición.
   ========================================================================== */
(function (root) {
  "use strict";
  const txt = v => String(v == null ? "" : v).trim();
  const clean = v => txt(v).replace(/\.0+$/, "");
  const nrm = x => String(x == null ? "" : x).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  // Código de producto: "8.325.096" (SAP con puntos de miles) -> "8325096"; "8315042.0" -> "8315042"
  const codeN = v => { if (typeof v === "number") return String(Math.round(v)); let t = clean(v); if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ""); return t; };
  const num = v => { if (typeof v === "number") return v; let t = txt(v).replace(/\s/g, ""); if (t === "") return 0; if (t.indexOf(",") >= 0) t = t.replace(/\./g, "").replace(",", "."); return Number(t) || 0; };
  const numS = v => (typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim())) ? Number(v) : v;
  const p2 = x => ("0" + x).slice(-2);
  const fecha = v => { v = numS(v); if (typeof v === "number" && v >= 1) { const d = new Date(Math.round((v - 25569) * 86400000)); return p2(d.getUTCDate()) + "/" + p2(d.getUTCMonth() + 1) + "/" + d.getUTCFullYear(); } return txt(v); };
  const hora = v => { v = numS(v); if (typeof v !== "number") return txt(v); const t = Math.round((v % 1) * 86400); return p2(Math.floor(t / 3600)) + ":" + p2(Math.floor(t % 3600 / 60)) + ":" + p2(t % 60); };

  const filasUtiles = aoa => (aoa || []).filter(r => Array.isArray(r) && r.some(c => txt(c) !== ""));
  const col = (h, fn) => h.findIndex(fn);

  function parseMara(aoa) {
    const A = filasUtiles(aoa); if (A.length < 2) throw new Error("El archivo no trae filas.");
    const h = A[0].map(nrm), iC = col(h, x => x.indexOf("CODIGO") === 0), iD = col(h, x => x.indexOf("DESCRIPCION") === 0), iE = col(h, x => x.indexOf("EAN") === 0), iU = col(h, x => x === "UMA"),
      iCa = col(h, x => x.indexOf("CAMA") >= 0 && x.indexOf("PQT") >= 0), iPc = col(h, x => x.indexOf("PAL") >= 0 && x.indexOf("CAM") >= 0), iPp = col(h, x => x.indexOf("PAL") >= 0 && x.indexOf("PQT") >= 0);
    if (iC < 0 || iD < 0) throw new Error("No encuentro las columnas CÓDIGO y DESCRIPCIÓN. ¿Es la hoja MARA?");
    const m = {};
    A.slice(1).forEach(r => { const c = codeN(r[iC]); if (!c) return;
      m[c] = { codigo: c, descripcion: txt(r[iD]), ean: iE >= 0 ? codeN(r[iE]) || null : null, uma: iU >= 0 ? txt(r[iU]) || null : null,
        cama_pqt: iCa >= 0 ? num(r[iCa]) || null : null, pal_cam: iPc >= 0 ? num(r[iPc]) || null : null, pal_pqt: iPp >= 0 ? num(r[iPp]) || null : null }; });
    return Object.values(m);
  }

  /** DRIVE / DINAMICA DRIVE: VIAJE REAL, FASE, CANAL SISTEMA, CANAL FÍSICO, CONO (el viaje puede venir solo en la primera fila del grupo) */
  function parseDrive(aoa) {
    const A = (aoa || []).filter(r => Array.isArray(r));
    let hi = A.findIndex(r => { const h = r.map(nrm); return h.some(x => x === "FASE") && h.some(x => x.indexOf("VIAJE") === 0 || x === "FO REAL" || x === "FO"); });
    if (hi < 0) throw new Error("No encuentro las columnas VIAJE REAL y FASE. ¿Es la hoja DRIVE o DINAMICA DRIVE?");
    const h = A[hi].map(nrm), iV = col(h, x => x === "VIAJE REAL" || x === "FO REAL" || x === "FO" || x.indexOf("VIAJE") === 0), iF = col(h, x => x === "FASE"),
      iS = col(h, x => x === "CANAL SISTEMA"), iP = col(h, x => x.indexOf("CANAL FISICO") === 0), iK = col(h, x => x === "CONO" || (x.indexOf("COLOR") === 0 && x.indexOf("CONO") > 0));
    let fo = ""; const out = {};
    A.slice(hi + 1).forEach(r => {
      if (txt(r[iV]) !== "") fo = clean(r[iV]);
      const fa = clean(r[iF]); if (!fa || isNaN(Number(fa))) return;
      out[fa] = { fase: fa, fo: fo && !isNaN(Number(fo)) ? fo : "", canal_sistema: iS >= 0 ? txt(r[iS]) : "", canal_fisico: iP >= 0 ? txt(r[iP]) : "", cono: iK >= 0 ? txt(r[iK]) : "" };
    });
    return Object.values(out);
  }

  function parseStock(aoa) {
    const A = filasUtiles(aoa); if (A.length < 2) throw new Error("El archivo no trae filas.");
    const h = A[0].map(nrm), iE = col(h, x => x === "ENTREGA"), iDc = col(h, x => x.indexOf("DOCUMENTO") === 0), iM = col(h, x => x === "MATERIAL"), iD = col(h, x => x.indexOf("DENOMINACION") === 0),
      iC = col(h, x => x === "CANTIDAD ENTREGA"), iU = col(h, x => x.indexOf("UN.MEDIDA") === 0 || x.indexOf("UN MEDIDA") === 0), iP = col(h, x => x === "PESO TOTAL"), iFo = col(h, x => x === "FO"), iFa = col(h, x => x === "FASE");
    if (iE < 0 || iM < 0 || iC < 0) throw new Error("No encuentro las columnas Entrega, Material y Cantidad entrega. ¿Es la hoja STOCK ENTREGAS?");
    const out = [];
    A.slice(1).forEach(r => { if (txt(r[iE]) === "") return;
      out.push({ entrega: clean(r[iE]), documento_compra: iDc >= 0 ? clean(r[iDc]) : null, material: codeN(r[iM]), descripcion: iD >= 0 ? txt(r[iD]) : "", cantidad: num(r[iC]),
        un: iU >= 0 ? txt(r[iU]) : "", peso: iP >= 0 ? num(r[iP]) : null, fo: iFo >= 0 ? clean(r[iFo]) : "", fase: iFa >= 0 ? clean(r[iFa]) : "" }); });
    return out;
  }

  function parsePicking(aoa) {
    const A = filasUtiles(aoa); if (A.length < 2) throw new Error("El archivo no trae filas.");
    const h = A[0].map(nrm), f = fn => col(h, fn), iFa = f(x => x === "FASE"), iT = f(x => x.indexOf("TAREA") === 0), iO = f(x => x.indexOf("ORDEN") === 0), iSt = f(x => x.indexOf("STATUS") === 0),
      iHu = f(x => x.indexOf("UMP DESTINO") === 0), iPr = f(x => x === "PRODUCTO"), iDe = f(x => x.indexOf("DESCRIPCION") === 0), iPv = f(x => x.indexOf("CTD.PREV") === 0),
      iDf = f(x => x.indexOf("CTD.DIF") === 0), iRl = f(x => x.indexOf("CTD.REAL") === 0), iLo = f(x => x === "LOTE"), iCp = f(x => x.indexOf("CONFIRMADO POR") === 0),
      iFc = f(x => x.indexOf("FECHA CONFIRM") === 0), iHc = f(x => x.indexOf("HORA DE CONFIRM") === 0 || x.indexOf("HORA CONFIRM") === 0), iFo = f(x => x === "FO"), iCl = f(x => x.indexOf("CL.PROCESO") === 0);
    if (iFa < 0 || iPr < 0) throw new Error("No encuentro las columnas Fase y Producto. ¿Es el export de PICKING?");
    const out = [];
    A.slice(1).forEach(r => { if (clean(r[iFa]) === "") return;
      out.push({ fo: iFo >= 0 && !isNaN(Number(clean(r[iFo]))) ? clean(r[iFo]) : "", fase: clean(r[iFa]), tarea: iT >= 0 ? clean(r[iT]) : null, orden: iO >= 0 ? clean(r[iO]) : null,
        status: iSt >= 0 ? txt(r[iSt]).toUpperCase() : "", hu: iHu >= 0 ? txt(r[iHu]) : "", producto: codeN(r[iPr]), descripcion: iDe >= 0 ? txt(r[iDe]) : "",
        ctd_prev: iPv >= 0 ? num(r[iPv]) : 0, ctd_dif: iDf >= 0 ? num(r[iDf]) : 0, ctd_real: iRl >= 0 ? num(r[iRl]) : 0, lote: iLo >= 0 ? txt(r[iLo]) : null,
        confirmado_por: iCp >= 0 ? txt(r[iCp]) : "", fecha_conf: iFc >= 0 ? fecha(r[iFc]) : "", hora_conf: iHc >= 0 ? hora(r[iHc]) : "", cl_proceso: iCl >= 0 ? txt(r[iCl]) : null }); });
    return out;
  }

  /** Colaboradores: USUARIO ASIGNADO + APELLIDO + NOMBRE (+ SUPERVISOR, GRUPO)  ó  el formato "USUARIOS EWM" (Usuario fijo + Nombre) */
  function parseUsuarios(aoa) {
    const A = filasUtiles(aoa); if (A.length < 2) throw new Error("El archivo no trae filas.");
    const h = A[0].map(nrm), m = {}, add = (u, nombre, sup, grupo) => { u = txt(u).toUpperCase(); nombre = txt(nombre).replace(/\s+/g, " ").toUpperCase(); if (!u || u === "SIN USUARIO" || !nombre) return;
      const o = m[u] = m[u] || { usuario: u, nombres: [], supervisor: "", grupo: "" }; if (o.nombres.indexOf(nombre) < 0) o.nombres.push(nombre); o.supervisor = o.supervisor || txt(sup); o.grupo = o.grupo || txt(grupo).toUpperCase(); };
    const iU = col(h, x => x.indexOf("USUARIO ASIGNADO") === 0), iA = col(h, x => x === "APELLIDO"), iN = col(h, x => x === "NOMBRE"), iS = col(h, x => x === "SUPERVISOR"), iG = col(h, x => x === "GRUPO");
    if (iU >= 0 && iA >= 0 && iN >= 0) {
      A.slice(1).forEach(r => add(r[iU], (txt(r[iN]).split(/\s+/)[0] + " " + txt(r[iA]).split(/\s+/)[0]).trim(), iS >= 0 ? r[iS] : "", iG >= 0 ? r[iG] : ""));
    } else {
      const iUf = col(h, x => x === "USUARIO FIJO"), lastN = h.lastIndexOf("NOMBRE"), lastS = h.lastIndexOf("SUPERVISOR");
      if (iUf < 0 || lastN < 0) throw new Error("No encuentro las columnas USUARIO ASIGNADO, APELLIDO y NOMBRE (o Usuario fijo y Nombre).");
      A.slice(1).forEach(r => add(r[iUf], r[lastN], lastS >= 0 ? r[lastS] : "", ""));
    }
    return Object.values(m).map(o => ({ usuario: o.usuario, nombre: o.nombres.join(" / "), supervisor: o.supervisor, grupo: o.grupo }));
  }

  /** MONITOR: Entrega -> Orden de flete (FO) */
  function parseMonitor(aoa) {
    const A = filasUtiles(aoa); if (A.length < 2) throw new Error("El archivo no trae filas.");
    const h = A[0].map(nrm), iE = col(h, x => x === "ENTREGA"), iF = col(h, x => x.indexOf("ORDEN DE FLETE") === 0 || x === "FO");
    if (iE < 0 || iF < 0) throw new Error("No encuentro las columnas Entrega y Orden de flete (FO). ¿Es la hoja MONITOR?");
    const m = {};
    A.slice(1).forEach(r => { const e = clean(r[iE]), f = clean(r[iF]); if (e && f && !isNaN(Number(f))) m[e] = f; });
    return Object.keys(m).map(e => ({ entrega: e, fo: m[e] }));
  }

  const api = { parseMonitor, parseMara, parseDrive, parseStock, parsePicking, parseUsuarios, codeN, num };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.CARGAS = api;
})(typeof window !== "undefined" ? window : globalThis);
