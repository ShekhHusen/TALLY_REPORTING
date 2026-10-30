/**
 * tallyService.js — Tally API Communication Module
 * 
 * Handles all HTTP communication with TallyPrime via its XML-over-HTTP API.
 * Uses Collection-based TDL queries for reliable data fetching.
 * Parses XML responses since TallyPrime may not support JSON export.
 * 
 * All data fetched stays LOCAL — no Firestore writes from this module.
 */

const DEFAULT_TALLY_URL = 'http://localhost:3001';
const REQUEST_TIMEOUT_MS = 60000; // 60 seconds for large datasets

// ─────────────────────────────────────────────────────────
// Core Request Function
// ─────────────────────────────────────────────────────────

/**
 * Send an XML request to TallyPrime and return the response text.
 * @param {string} xmlPayload - XML envelope string
 * @param {string} tallyUrl - Tally endpoint URL
 * @returns {Promise<string>} Raw response text (XML)
 */
async function sendRawRequest(xmlPayload, tallyUrl = DEFAULT_TALLY_URL) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(tallyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml',
                'Connection': 'close',
                'Accept': '*/*',
            },
            body: xmlPayload,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Tally HTTP Error: ${response.status} ${response.statusText}`);
        }

        return await response.text();
    } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            throw new Error('Tally request timed out. Is TallyPrime running?');
        }
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            throw new Error(
                'Cannot connect to Tally. Ensure TallyPrime is running and CORS proxy is active.\n' +
                'Run: cd tally-proxy && npm start\n' +
                `Attempted URL: ${tallyUrl}`
            );
        }
        throw error;
    }
}


// ─────────────────────────────────────────────────────────
// XML Builder Functions (Collection-based TDL queries)
// ─────────────────────────────────────────────────────────

/** Build XML to list all companies loaded in Tally */
export function buildListCompaniesXML() {
    return `<ENVELOPE>
    <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>List of Companies</ID>
    </HEADER>
    <BODY>
        <DESC>
            <STATICVARIABLES>
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
        </DESC>
    </BODY>
</ENVELOPE>`;
}

/** Build XML to export all Ledger masters via Collection TDL */
export function buildLedgerExportXML(companyName) {
    return `<ENVELOPE>
    <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>CustomLedgerList</ID>
    </HEADER>
    <BODY>
        <DESC>
            <STATICVARIABLES>
                ${companyName ? `<SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>` : ''}
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
            <TDL>
                <TDLMESSAGE>
                    <COLLECTION NAME="CustomLedgerList" ISINITIALIZE="Yes">
                        <TYPE>Ledger</TYPE>
                        <FETCH>NAME, PARENT, OPENINGBALANCE, CLOSINGBALANCE, ADDRESS.LIST, LEDGERPHONE, LEDGERMOBILE, GUID</FETCH>
                    </COLLECTION>
                </TDLMESSAGE>
            </TDL>
        </DESC>
    </BODY>
</ENVELOPE>`;
}

/** Build XML to export all Stock Item masters via Collection TDL */
export function buildStockItemExportXML(companyName) {
    return `<ENVELOPE>
    <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>CustomStockItemList</ID>
    </HEADER>
    <BODY>
        <DESC>
            <STATICVARIABLES>
                ${companyName ? `<SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>` : ''}
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
            <TDL>
                <TDLMESSAGE>
                    <COLLECTION NAME="CustomStockItemList" ISINITIALIZE="Yes">
                        <TYPE>StockItem</TYPE>
                        <FETCH>NAME, PARENT, CATEGORY, BASEUNITS, OPENINGBALANCE, OPENINGRATE, OPENINGVALUE, CLOSINGBALANCE, CLOSINGRATE, CLOSINGVALUE, GUID, DESCRIPTION</FETCH>
                    </COLLECTION>
                </TDLMESSAGE>
            </TDL>
        </DESC>
    </BODY>
</ENVELOPE>`;
}

/** Build XML to export Vouchers (transactions) via Collection TDL for a date range */
export function buildVoucherExportXML(companyName, fromDate, toDate) {
    return `<ENVELOPE>
    <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>CustomVoucherList</ID>
    </HEADER>
    <BODY>
        <DESC>
            <STATICVARIABLES>
                ${companyName ? `<SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>` : ''}
                ${fromDate ? `<SVFROMDATE TYPE="Date">${fromDate}</SVFROMDATE>` : ''}
                ${toDate ? `<SVTODATE TYPE="Date">${toDate}</SVTODATE>` : ''}
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
            <TDL>
                <TDLMESSAGE>
                    <COLLECTION NAME="CustomVoucherList" ISINITIALIZE="Yes">
                        <TYPE>Voucher</TYPE>
                        <CHILDORDER>$$Date:$$Value</CHILDORDER>
                        <FETCH>DATE, VOUCHERTYPENAME, VOUCHERNUMBER, REFERENCE, PARTYLEDGERNAME, AMOUNT, NARRATION, GUID, REMOTEID, ALTERID, MASTERID, ALLLEDGERENTRIES.LIST, LEDGERENTRIES.LIST, ALLINVENTORYENTRIES.LIST</FETCH>
                    </COLLECTION>
                </TDLMESSAGE>
            </TDL>
        </DESC>
    </BODY>
</ENVELOPE>`;
}

/** Build XML to export newly created or altered Vouchers via Collection TDL filtering by ALTERID */
export function buildIncrementalVoucherExportXML(companyName, alterIdThreshold = 0) {
    return `<ENVELOPE>
    <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>IncrementalVoucherList</ID>
    </HEADER>
    <BODY>
        <DESC>
            <STATICVARIABLES>
                ${companyName ? `<SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>` : ''}
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
            <TDL>
                <TDLMESSAGE>
                    <COLLECTION NAME="IncrementalVoucherList" ISINITIALIZE="Yes">
                        <TYPE>Voucher</TYPE>
                        <CHILDORDER>$$Date:$$Value</CHILDORDER>
                        <FETCH>DATE, VOUCHERTYPENAME, VOUCHERNUMBER, REFERENCE, PARTYLEDGERNAME, AMOUNT, NARRATION, GUID, REMOTEID, ALTERID, MASTERID, ALLLEDGERENTRIES.LIST, LEDGERENTRIES.LIST, ALLINVENTORYENTRIES.LIST</FETCH>
                        <FILTER>OnlyAlteredVouchers</FILTER>
                    </COLLECTION>
                    <SYSTEM TYPE="Formulae" NAME="OnlyAlteredVouchers">$$Number:$ALTERID &gt; ${alterIdThreshold}</SYSTEM>
                </TDLMESSAGE>
            </TDL>
        </DESC>
    </BODY>
</ENVELOPE>`;
}

/** Build XML to quickly fetch current max ALTERID from Tally vouchers */
export function buildMaxAlterIdQueryXML(companyName) {
    return `<ENVELOPE>
    <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>MaxAlterIdQuery</ID>
    </HEADER>
    <BODY>
        <DESC>
            <STATICVARIABLES>
                ${companyName ? `<SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>` : ''}
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
            <TDL>
                <TDLMESSAGE>
                    <COLLECTION NAME="MaxAlterIdQuery" ISINITIALIZE="Yes">
                        <TYPE>Voucher</TYPE>
                        <FETCH>ALTERID</FETCH>
                    </COLLECTION>
                </TDLMESSAGE>
            </TDL>
        </DESC>
    </BODY>
</ENVELOPE>`;
}


// ─────────────────────────────────────────────────────────
// High-Level Fetch Functions
// ─────────────────────────────────────────────────────────

/**
 * Test connection to Tally and return loaded companies.
 * @returns {{ connected: boolean, companies: string[], error?: string }}
 */
export async function testConnection(tallyUrl = DEFAULT_TALLY_URL) {
    try {
        const xml = buildListCompaniesXML();
        const responseText = await sendRawRequest(xml, tallyUrl);

        if (!responseText || responseText.trim().length === 0) {
            return { connected: false, companies: [], error: 'Empty response from Tally' };
        }

        const companies = extractCompanyNamesFromXML(responseText);
        return { connected: true, companies };
    } catch (error) {
        return { connected: false, companies: [], error: error.message };
    }
}

/**
 * Fetch all ledger masters from Tally.
 * Returns parsed array of ledger objects for the UI.
 */
export async function fetchLedgerMasters(companyName, tallyUrl = DEFAULT_TALLY_URL) {
    const xml = buildLedgerExportXML(companyName);
    const responseText = await sendRawRequest(xml, tallyUrl);

    if (!responseText || responseText.trim().length === 0) {
        throw new Error('Empty response from Tally. Check if company is loaded.');
    }

    // Check for error in response
    if (responseText.includes('<LINEERROR>')) {
        const errorMatch = responseText.match(/<LINEERROR>([^<]+)<\/LINEERROR>/);
        throw new Error(`Tally Error: ${errorMatch ? errorMatch[1] : 'Unknown error'}`);
    }

    return parseLedgersFromXML(responseText);
}

/**
 * Fetch all stock items (inventory) from Tally.
 * Returns parsed array of stock item objects for the UI.
 */
export async function fetchStockItems(companyName, tallyUrl = DEFAULT_TALLY_URL) {
    const xml = buildStockItemExportXML(companyName);
    const responseText = await sendRawRequest(xml, tallyUrl);

    if (!responseText || responseText.trim().length === 0) {
        throw new Error('Empty response from Tally. Check if company is loaded.');
    }

    if (responseText.includes('<LINEERROR>')) {
        const errorMatch = responseText.match(/<LINEERROR>([^<]+)<\/LINEERROR>/);
        throw new Error(`Tally Error: ${errorMatch ? errorMatch[1] : 'Unknown error'}`);
    }

    return parseStockItemsFromXML(responseText);
}

/**
 * Fetch all vouchers/transactions from Tally for a date range.
 * @param {string} fromDate - YYYYMMDD format
 * @param {string} toDate - YYYYMMDD format
 * Returns parsed array of transaction objects for the UI.
 */
export async function fetchVouchers(companyName, fromDate, toDate, tallyUrl = DEFAULT_TALLY_URL) {
    const xml = buildVoucherExportXML(companyName, fromDate, toDate);
    const responseText = await sendRawRequest(xml, tallyUrl);

    if (!responseText || responseText.trim().length === 0) {
        throw new Error('Empty response from Tally. Check if company is loaded.');
    }

    if (responseText.includes('<LINEERROR>')) {
        const errorMatch = responseText.match(/<LINEERROR>([^<]+)<\/LINEERROR>/);
        throw new Error(`Tally Error: ${errorMatch ? errorMatch[1] : 'Unknown error'}`);
    }

    return parseVouchersFromXML(responseText);
}

/**
 * Fetch newly created or altered vouchers since a given alterId threshold.
 * @param {string} companyName
 * @param {number} alterIdThreshold
 * @param {string} tallyUrl
 * @returns {Promise<{ vouchers: any[], maxAlterId: number }>}
 */
export async function fetchIncrementalVouchers(companyName, alterIdThreshold = 0, tallyUrl = DEFAULT_TALLY_URL) {
    const xml = buildIncrementalVoucherExportXML(companyName, alterIdThreshold);
    const responseText = await sendRawRequest(xml, tallyUrl);

    if (!responseText || responseText.trim().length === 0) {
        return { vouchers: [], maxAlterId: alterIdThreshold };
    }

    if (responseText.includes('<LINEERROR>')) {
        const errorMatch = responseText.match(/<LINEERROR>([^<]+)<\/LINEERROR>/);
        throw new Error(`Tally Error: ${errorMatch ? errorMatch[1] : 'Unknown error'}`);
    }

    const vouchers = parseVouchersFromXML(responseText);
    let maxAlterId = alterIdThreshold;
    for (const v of vouchers) {
        if (v.alterId && v.alterId > maxAlterId) {
            maxAlterId = v.alterId;
        }
    }
    return { vouchers, maxAlterId };
}

/**
 * Fetch current highest ALTERID from Tally to set initial baseline for auto-sync.
 */
export async function fetchCurrentMaxAlterId(companyName, tallyUrl = DEFAULT_TALLY_URL) {
    const xml = buildMaxAlterIdQueryXML(companyName);
    const responseText = await sendRawRequest(xml, tallyUrl);
    if (!responseText) return 0;
    const matches = [...responseText.matchAll(/<ALTERID[^>]*>([^<]+)<\/ALTERID>/gi)];
    const ids = matches.map(m => parseInt(m[1].trim(), 10)).filter(n => !isNaN(n));
    return ids.length > 0 ? Math.max(...ids) : 0;
}


// ─────────────────────────────────────────────────────────
// XML Parsing Functions
// ─────────────────────────────────────────────────────────

/**
 * Extract company names from the List of Companies XML response.
 */
function extractCompanyNamesFromXML(xmlText) {
    const names = [];
    // Match COMPANY NAME="..." attribute
    const companyMatches = xmlText.matchAll(/<COMPANY\s+NAME="([^"]+)"/gi);
    for (const m of companyMatches) {
        const name = decodeXmlEntities(m[1]);
        if (name && !names.includes(name)) names.push(name);
    }
    // Fallback: match <NAME> inside <COMPANY>
    if (names.length === 0) {
        const nameMatches = xmlText.matchAll(/<COMPANY[^>]*>[\s\S]*?<NAME[^>]*>([^<]+)<\/NAME>/gi);
        for (const m of nameMatches) {
            const name = decodeXmlEntities(m[1]).trim();
            if (name && !names.includes(name)) names.push(name);
        }
    }
    return names;
}

/**
 * Parse Ledger XML response into an array of account objects
 * compatible with the existing parser.js processMaster() output format.
 * Uses robust regex parsing to avoid browser DOMParser namespace failures on Tally UDF tags.
 */
function parseLedgersFromXML(xmlText) {
    const accounts = [];
    const lRegex = /<LEDGER\b[^>]*NAME="([^"]+)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
    let m;

    while ((m = lRegex.exec(xmlText)) !== null) {
        const name = m[1];
        const body = m[2];
        const parentM = body.match(/<PARENT[^>]*>([^<]+)<\/PARENT>/i);
        const obM = body.match(/<OPENINGBALANCE[^>]*>([^<]+)<\/OPENINGBALANCE>/i);
        const cbM = body.match(/<CLOSINGBALANCE[^>]*>([^<]+)<\/CLOSINGBALANCE>/i);
        const guidM = body.match(/<GUID[^>]*>([^<]+)<\/GUID>/i);
        const phoneM = body.match(/<LEDGERPHONE[^>]*>([^<]+)<\/LEDGERPHONE>/i);
        const mobileM = body.match(/<LEDGERMOBILE[^>]*>([^<]+)<\/LEDGERMOBILE>/i);

        // Address parts
        const addrRegex = /<ADDRESS[^>]*>([^<]+)<\/ADDRESS>/gi;
        const addrs = [];
        let aM;
        while ((aM = addrRegex.exec(body)) !== null) {
            const part = decodeXmlEntities(aM[1]);
            if (part) addrs.push(part);
        }

        const ob = parseFloat((obM?.[1] || '0').replace(/[^0-9.\-]/g, '')) || 0;
        const cb = parseFloat((cbM?.[1] || '0').replace(/[^0-9.\-]/g, '')) || 0;
        const cleanParent = decodeXmlEntities(parentM?.[1] || '').replace(/[\x00-\x1F]/g, '').trim();

        accounts.push({
            name: decodeXmlEntities(name),
            group: cleanParent,
            openingBalance: Math.abs(ob),
            openingBalanceType: ob < 0 ? 'Dr' : (ob > 0 ? 'Cr' : ''),
            closingBalance: Math.abs(cb),
            closingBalanceType: cb < 0 ? 'Dr' : (cb > 0 ? 'Cr' : ''),
            address: addrs.join(', '),
            contact: decodeXmlEntities(mobileM?.[1] || phoneM?.[1] || ''),
            guid: guidM?.[1] || '',
        });
    }

    return accounts;
}

/**
 * Parse StockItem XML response into an array of inventory items.
 * Uses robust regex parsing to prevent DOMParser namespace issues.
 */
function parseStockItemsFromXML(xmlText) {
    const items = [];
    const itemRegex = /<STOCKITEM\b[^>]*NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
    let m;

    while ((m = itemRegex.exec(xmlText)) !== null) {
        const rawName = m[1];
        const body = m[2];

        const parentM = body.match(/<PARENT[^>]*>([^<]+)<\/PARENT>/i);
        const catM = body.match(/<CATEGORY[^>]*>([^<]+)<\/CATEGORY>/i);
        const unitsM = body.match(/<BASEUNITS[^>]*>([^<]+)<\/BASEUNITS>/i);
        const obBalM = body.match(/<OPENINGBALANCE[^>]*>([^<]+)<\/OPENINGBALANCE>/i);
        const obRateM = body.match(/<OPENINGRATE[^>]*>([^<]+)<\/OPENINGRATE>/i);
        const obValM = body.match(/<OPENINGVALUE[^>]*>([^<]+)<\/OPENINGVALUE>/i);
        const cbBalM = body.match(/<CLOSINGBALANCE[^>]*>([^<]+)<\/CLOSINGBALANCE>/i);
        const cbRateM = body.match(/<CLOSINGRATE[^>]*>([^<]+)<\/CLOSINGRATE>/i);
        const cbValM = body.match(/<CLOSINGVALUE[^>]*>([^<]+)<\/CLOSINGVALUE>/i);
        const guidM = body.match(/<GUID[^>]*>([^<]+)<\/GUID>/i);
        const descM = body.match(/<DESCRIPTION[^>]*>([^<]+)<\/DESCRIPTION>/i);

        const cleanParent = decodeXmlEntities(parentM?.[1] || '').replace(/[\x00-\x1F]/g, '').trim();
        const cleanCat = decodeXmlEntities(catM?.[1] || '').replace(/[\x00-\x1F]/g, '').trim();
        const baseUnits = decodeXmlEntities(unitsM?.[1] || '').trim();

        const obBalStr = decodeXmlEntities(obBalM?.[1] || '').trim();
        const cbBalStr = decodeXmlEntities(cbBalM?.[1] || '').trim();

        const obQty = parseFloat(obBalStr.replace(/[^0-9.\-]/g, '')) || 0;
        const cbQty = parseFloat(cbBalStr.replace(/[^0-9.\-]/g, '')) || 0;

        const obVal = Math.abs(parseFloat((obValM?.[1] || '0').replace(/[^0-9.\-]/g, '')) || 0);
        const cbVal = Math.abs(parseFloat((cbValM?.[1] || '0').replace(/[^0-9.\-]/g, '')) || 0);

        items.push({
            id: guidM?.[1] || decodeXmlEntities(rawName),
            guid: guidM?.[1] || '',
            name: decodeXmlEntities(rawName),
            group: cleanParent || 'Primary',
            parent: cleanParent || 'Primary',
            category: cleanCat || '-',
            baseUnits: baseUnits || '-',
            openingBalance: obBalStr || '-',
            openingQty: obQty,
            openingRate: decodeXmlEntities(obRateM?.[1] || '').trim() || '-',
            openingValue: obVal,
            closingBalance: cbBalStr || '-',
            closingQty: cbQty,
            closingRate: decodeXmlEntities(cbRateM?.[1] || '').trim() || '-',
            closingValue: cbVal,
            description: decodeXmlEntities(descM?.[1] || '').trim(),
        });
    }

    return items;
}

/**
 * Parse Voucher XML response into an array of transaction objects
 * compatible with the existing parser.js processTransactions() output format.
 * Uses robust regex parsing to prevent DOMParser from choking on undeclared UDF namespaces.
 */
function parseVouchersFromXML(xmlText) {
    const transactions = [];
    const vRegex = /<VOUCHER\b[^>]*REMOTEID="([^"]+)"[^>]*>([\s\S]*?)<\/VOUCHER>/gi;
    let match;

    while ((match = vRegex.exec(xmlText)) !== null) {
        const guid = match[1];
        const block = match[2];

        const dateMatch = block.match(/<DATE[^>]*>([^<]+)<\/DATE>/i);
        const typeMatch = block.match(/<VOUCHERTYPENAME[^>]*>([^<]+)<\/VOUCHERTYPENAME>/i);
        const noMatch = block.match(/<VOUCHERNUMBER[^>]*>([^<]+)<\/VOUCHERNUMBER>/i);
        const partyMatch = block.match(/<PARTYLEDGERNAME[^>]*>([^<]+)<\/PARTYLEDGERNAME>/i);
        const narrMatch = block.match(/<NARRATION[^>]*>([^<]+)<\/NARRATION>/i);
        const topAmtMatch = block.match(/<AMOUNT[^>]*>([^<]+)<\/AMOUNT>/i);
        const alterMatch = block.match(/<ALTERID[^>]*>([^<]+)<\/ALTERID>/i);
        const masterMatch = block.match(/<MASTERID[^>]*>([^<]+)<\/MASTERID>/i);

        const alterId = alterMatch ? parseInt(alterMatch[1].trim(), 10) : 0;
        const masterId = masterMatch ? parseInt(masterMatch[1].trim(), 10) : 0;

        const dateRaw = dateMatch ? dateMatch[1].trim() : '';
        const date = dateRaw.length === 8 ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}` : dateRaw;
        const type = decodeXmlEntities(typeMatch ? typeMatch[1].trim() : '');
        const voucherNo = decodeXmlEntities(noMatch ? noMatch[1].trim() : '');
        const partyLedger = decodeXmlEntities(partyMatch ? partyMatch[1].trim() : '');
        const narration = decodeXmlEntities(narrMatch ? narrMatch[1].trim() : '');
        const topAmount = topAmtMatch ? Math.abs(parseFloat(topAmtMatch[1].replace(/[^0-9.\-]/g, '')) || 0) : 0;

        const debitEntries = [];
        const creditEntries = [];

        // Determine if this voucher has ALLLEDGERENTRIES.LIST
        const hasAllLedgers = block.includes('<ALLLEDGERENTRIES.LIST>');
        const targetRegex = hasAllLedgers
            ? /<ALLLEDGERENTRIES\.LIST>([\s\S]*?)<\/ALLLEDGERENTRIES\.LIST>/gi
            : /<LEDGERENTRIES\.LIST>([\s\S]*?)<\/LEDGERENTRIES\.LIST>/gi;

        let eMatch;
        while ((eMatch = targetRegex.exec(block)) !== null) {
            const eBlock = eMatch[1];
            const nameM = eBlock.match(/<LEDGERNAME[^>]*>([^<]+)<\/LEDGERNAME>/i);
            const amtM = eBlock.match(/<AMOUNT[^>]*>([^<]+)<\/AMOUNT>/i);
            const posM = eBlock.match(/<ISDEEMEDPOSITIVE[^>]*>([^<]+)<\/ISDEEMEDPOSITIVE>/i);

            if (nameM) {
                const name = decodeXmlEntities(nameM[1].trim());
                const rawAmt = amtM ? amtM[1].replace(/[^0-9.\-]/g, '') : '0';
                const parsedAmt = parseFloat(rawAmt) || 0;
                const absAmt = Math.abs(parsedAmt);
                const isPos = posM ? posM[1].trim().toLowerCase() === 'yes' : parsedAmt < 0;

                if (isPos) {
                    debitEntries.push({ name, amount: absAmt });
                } else {
                    creditEntries.push({ name, amount: absAmt });
                }
            }
        }

        // If debits or credits are still empty, check for ACCOUNTINGALLOCATIONS.LIST inside inventory
        if (debitEntries.length === 0 || creditEntries.length === 0) {
            const allocRegex = /<ACCOUNTINGALLOCATIONS\.LIST>([\s\S]*?)<\/ACCOUNTINGALLOCATIONS\.LIST>/gi;
            let aMatch;
            while ((aMatch = allocRegex.exec(block)) !== null) {
                const aBlock = aMatch[1];
                const nameM = aBlock.match(/<LEDGERNAME[^>]*>([^<]+)<\/LEDGERNAME>/i);
                const amtM = aBlock.match(/<AMOUNT[^>]*>([^<]+)<\/AMOUNT>/i);
                const posM = aBlock.match(/<ISDEEMEDPOSITIVE[^>]*>([^<]+)<\/ISDEEMEDPOSITIVE>/i);

                if (nameM) {
                    const name = decodeXmlEntities(nameM[1].trim());
                    const rawAmt = amtM ? amtM[1].replace(/[^0-9.\-]/g, '') : '0';
                    const parsedAmt = parseFloat(rawAmt) || 0;
                    const absAmt = Math.abs(parsedAmt);
                    const isPos = posM ? posM[1].trim().toLowerCase() === 'yes' : parsedAmt < 0;

                    if (isPos && !debitEntries.some(e => e.name === name)) {
                        debitEntries.push({ name, amount: absAmt });
                    } else if (!isPos && !creditEntries.some(e => e.name === name)) {
                        creditEntries.push({ name, amount: absAmt });
                    }
                }
            }
        }

        // Parse Inventory Entries
        const inventory = [];
        const invRegex = /<ALLINVENTORYENTRIES\.LIST>([\s\S]*?)<\/ALLINVENTORYENTRIES\.LIST>/gi;
        let invM;
        while ((invM = invRegex.exec(block)) !== null) {
            const invBlock = invM[1];
            const itemM = invBlock.match(/<STOCKITEMNAME[^>]*>([^<]+)<\/STOCKITEMNAME>/i);
            const qtyM = invBlock.match(/<(?:ACTUALQTY|BILLEDQTY)[^>]*>([^<]+)<\/(?:ACTUALQTY|BILLEDQTY)>/i);
            const rateM = invBlock.match(/<RATE[^>]*>([^<]+)<\/RATE>/i);
            const amtM = invBlock.match(/<AMOUNT[^>]*>([^<]+)<\/AMOUNT>/i);

            if (itemM) {
                inventory.push({
                    itemName: decodeXmlEntities(itemM[1].trim()),
                    qty: decodeXmlEntities(qtyM ? qtyM[1].trim() : ''),
                    rate: decodeXmlEntities(rateM ? rateM[1].trim() : ''),
                    amount: amtM ? Math.abs(parseFloat(amtM[1].replace(/[^0-9.\-]/g, '')) || 0) : 0,
                });
            }
        }

        // Fallback if no ledger entries were found
        if (debitEntries.length === 0 && creditEntries.length === 0 && topAmount > 0) {
            debitEntries.push({ name: partyLedger || 'Debit', amount: topAmount });
            creditEntries.push({ name: 'Credit', amount: topAmount });
        }

        // Calculate totals
        const totalDebit = debitEntries.reduce((acc, curr) => acc + curr.amount, 0);
        const totalCredit = creditEntries.reduce((acc, curr) => acc + curr.amount, 0);
        const voucherAmount = totalDebit || totalCredit || topAmount;

        const primaryDebit = debitEntries.length > 0 ? debitEntries[0].name : (partyLedger || '-');
        const primaryCredit = creditEntries.length > 0 ? creditEntries[0].name : '-';

        const allDebitNames = [...new Set(debitEntries.map(e => e.name).filter(Boolean))];
        const allCreditNames = [...new Set(creditEntries.map(e => e.name).filter(Boolean))];

        transactions.push({
            id: guid,
            guid,
            date,
            type,
            voucherNo,
            voucherNumber: voucherNo,
            debitAccount: primaryDebit,
            debitAmount: totalDebit || voucherAmount,
            creditAccount: primaryCredit,
            creditAmount: totalCredit || voucherAmount,
            amount: voucherAmount,
            allDebitEntries: debitEntries,
            allCreditEntries: creditEntries,
            allDebitAccounts: allDebitNames.length > 0 ? allDebitNames : (primaryDebit !== '-' ? [primaryDebit] : []),
            allCreditAccounts: allCreditNames.length > 0 ? allCreditNames : (primaryCredit !== '-' ? [primaryCredit] : []),
            narration,
            partyLedger,
            inventory,
            alterId,
            masterId,
        });
    }

    return transactions;
}


// ─────────────────────────────────────────────────────────
// Date Helpers
// ─────────────────────────────────────────────────────────

/**
 * Convert YYYY-MM-DD (app format) to YYYYMMDD (Tally format)
 */
export function toTallyDate(isoDate) {
    if (!isoDate) return '';
    return String(isoDate).trim().slice(0, 10).replace(/[^0-9]/g, '');
}

/**
 * Convert YYYYMMDD (Tally format) to YYYY-MM-DD (app format)
 */
export function fromTallyDate(tallyDate) {
    if (!tallyDate || tallyDate.length !== 8) return '';
    return `${tallyDate.slice(0, 4)}-${tallyDate.slice(4, 6)}-${tallyDate.slice(6, 8)}`;
}


// ─────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────

/** Escape special XML characters in values */
function escapeXml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** Decode XML entities back to plain text */
function decodeXmlEntities(str) {
    if (!str) return '';
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#4;/g, '') // Tally control chars
        .replace(/[\x00-\x1F]/g, '') // strip other control chars
        .trim();
}

/** Get text content of first matching child element */
function getNodeText(parentNode, tagName) {
    if (!parentNode) return '';
    // getElementsByTagName handles all XML tag names (including dots like ALLLEDGERENTRIES.LIST)
    const elements = parentNode.getElementsByTagName(tagName);
    if (elements && elements.length > 0) {
        return elements[0].textContent?.trim() || '';
    }
    // Fallback using querySelector with escaped dots
    try {
        const escapedTag = tagName.replace(/\./g, '\\.');
        const node = parentNode.querySelector(escapedTag);
        if (node) return node.textContent?.trim() || '';
    } catch { /* ignore */ }
    return '';
}


// ─────────────────────────────────────────────────────────
// localStorage Helpers for Tally Sync Cache
// ─────────────────────────────────────────────────────────

const LS_KEYS = {
    URL: 'tallysync_url',
    COMPANY: 'tallysync_company',
    MASTERS: 'tallysync_masters',
    MASTERS_TS: 'tallysync_masters_ts',
    TXNS: 'tallysync_txns',
    TXNS_TS: 'tallysync_txns_ts',
    TXNS_FY: 'tallysync_txns_fy',
    ITEMS: 'tallysync_items',
    ITEMS_TS: 'tallysync_items_ts',
    LAST_ALTERID: 'tallysync_last_alterid',
    AUTOSYNC_ENABLED: 'tallysync_autosync_enabled',
    AUTOSYNC_INTERVAL: 'tallysync_autosync_interval',
};

export function getSavedTallyUrl() {
    try { return localStorage.getItem(LS_KEYS.URL) || DEFAULT_TALLY_URL; }
    catch { return DEFAULT_TALLY_URL; }
}

export function saveTallyUrl(url) {
    try { localStorage.setItem(LS_KEYS.URL, url); } catch { /* ignore */ }
}

export function getSavedCompany() {
    try { return localStorage.getItem(LS_KEYS.COMPANY) || ''; }
    catch { return ''; }
}

export function saveCompany(name) {
    try { localStorage.setItem(LS_KEYS.COMPANY, name); } catch { /* ignore */ }
}

export function cacheMasters(parsedAccounts) {
    try {
        localStorage.setItem(LS_KEYS.MASTERS, JSON.stringify(parsedAccounts));
        localStorage.setItem(LS_KEYS.MASTERS_TS, new Date().toISOString());
    } catch (e) {
        console.error('Failed to cache masters:', e);
    }
}

export function getCachedMasters() {
    try {
        const raw = localStorage.getItem(LS_KEYS.MASTERS);
        const ts = localStorage.getItem(LS_KEYS.MASTERS_TS);
        if (!raw) return { data: null, timestamp: null };
        return { data: JSON.parse(raw), timestamp: ts };
    } catch { return { data: null, timestamp: null }; }
}

export function cacheStockItems(items) {
    try {
        localStorage.setItem(LS_KEYS.ITEMS, JSON.stringify(items));
        localStorage.setItem(LS_KEYS.ITEMS_TS, new Date().toISOString());
    } catch (e) {
        console.error('Failed to cache stock items:', e);
    }
}

export function getCachedStockItems() {
    try {
        const raw = localStorage.getItem(LS_KEYS.ITEMS);
        const ts = localStorage.getItem(LS_KEYS.ITEMS_TS);
        if (!raw) return { data: null, timestamp: null };
        return { data: JSON.parse(raw), timestamp: ts };
    } catch { return { data: null, timestamp: null }; }
}

export function cacheTransactions(parsedTxns, fyObj) {
    try {
        localStorage.setItem(LS_KEYS.TXNS, JSON.stringify(parsedTxns));
        localStorage.setItem(LS_KEYS.TXNS_TS, new Date().toISOString());
        if (fyObj) localStorage.setItem(LS_KEYS.TXNS_FY, JSON.stringify(fyObj));

        // Update lastAlterId baseline if transactions contain alterIds
        if (Array.isArray(parsedTxns) && parsedTxns.length > 0) {
            const maxAlter = Math.max(0, ...(parsedTxns.map(t => t.alterId || 0)));
            if (maxAlter > 0) saveLastAlterId(maxAlter);
        }
    } catch (e) {
        console.error('Failed to cache transactions:', e);
    }
}

export function getLastAlterId() {
    try {
        const val = localStorage.getItem(LS_KEYS.LAST_ALTERID);
        return val ? parseInt(val, 10) : 0;
    } catch { return 0; }
}

export function saveLastAlterId(alterId) {
    try {
        if (alterId && alterId > 0) localStorage.setItem(LS_KEYS.LAST_ALTERID, String(alterId));
    } catch { /* ignore */ }
}

export function getAutoSyncSettings() {
    try {
        const enabled = localStorage.getItem(LS_KEYS.AUTOSYNC_ENABLED) === 'true';
        const interval = parseInt(localStorage.getItem(LS_KEYS.AUTOSYNC_INTERVAL) || '5', 10);
        return { enabled, interval: Math.max(2, interval) };
    } catch {
        return { enabled: false, interval: 5 };
    }
}

export function saveAutoSyncSettings(enabled, interval) {
    try {
        localStorage.setItem(LS_KEYS.AUTOSYNC_ENABLED, String(enabled));
        if (interval) localStorage.setItem(LS_KEYS.AUTOSYNC_INTERVAL, String(interval));
    } catch { /* ignore */ }
}

/**
 * Merge newly created or altered transactions into the cached list.
 * Updates in-place if existing, prepends if new.
 */
export function mergeIncrementalVouchers(newOrAlteredTxns) {
    if (!newOrAlteredTxns || newOrAlteredTxns.length === 0) {
        const cached = getCachedTransactions();
        return { merged: cached.data || [], createdCount: 0, alteredCount: 0, affectedTxns: [], totalCount: cached.data?.length || 0 };
    }

    const cached = getCachedTransactions();
    const currentList = Array.isArray(cached.data) ? [...cached.data] : [];
    let createdCount = 0;
    let alteredCount = 0;
    const affectedTxns = [];

    newOrAlteredTxns.forEach(newTxn => {
        const idx = currentList.findIndex(t => 
            (t.guid && newTxn.guid && t.guid === newTxn.guid) ||
            (t.id && newTxn.id && t.id === newTxn.id) ||
            (t.masterId && newTxn.masterId && t.masterId === newTxn.masterId)
        );

        if (idx >= 0) {
            // Altered / Updated voucher
            const updated = {
                ...currentList[idx],
                ...newTxn,
                _syncAction: 'altered',
                _syncTimestamp: Date.now(),
            };
            currentList[idx] = updated;
            affectedTxns.push(updated);
            alteredCount++;
        } else {
            // Newly created voucher
            const created = {
                ...newTxn,
                _syncAction: 'created',
                _syncTimestamp: Date.now(),
            };
            currentList.unshift(created);
            affectedTxns.push(created);
            createdCount++;
        }
    });

    // Update highest alterId in localStorage
    const highestAlterId = Math.max(
        getLastAlterId(),
        ...newOrAlteredTxns.map(t => t.alterId || 0)
    );
    saveLastAlterId(highestAlterId);

    // Save updated transactions to cache
    cacheTransactions(currentList, cached.fy);

    return {
        merged: currentList,
        createdCount,
        alteredCount,
        affectedTxns,
        totalCount: currentList.length,
    };
}

export function getCachedTransactions() {
    try {
        const raw = localStorage.getItem(LS_KEYS.TXNS);
        const ts = localStorage.getItem(LS_KEYS.TXNS_TS);
        const fy = localStorage.getItem(LS_KEYS.TXNS_FY);
        if (!raw) return { data: null, timestamp: null, fy: null };
        return { data: JSON.parse(raw), timestamp: ts, fy: fy ? JSON.parse(fy) : null };
    } catch { return { data: null, timestamp: null, fy: null }; }
}

export function clearTallySyncCache() {
    try {
        Object.values(LS_KEYS).forEach(key => localStorage.removeItem(key));
    } catch { /* ignore */ }
}

export function getCacheSize() {
    try {
        let total = 0;
        Object.values(LS_KEYS).forEach(key => {
            const item = localStorage.getItem(key);
            if (item) total += item.length * 2; // approximate bytes (UTF-16)
        });
        return total;
    } catch { return 0; }
}

export function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}


// ─────────────────────────────────────────────────────────
// Tally Voucher / Invoice POST (Import Data) Builders
// ─────────────────────────────────────────────────────────

/**
 * Build XML to import an Accounting Voucher (Payment, Receipt, Journal, Contra) into TallyPrime.
 */
export function buildAccountingVoucherXML(voucher, companyName) {
    const vchType = voucher.type || 'Payment';
    const dateStr = toTallyDate(voucher.date || new Date().toISOString().slice(0, 10));
    const vchNo = voucher.voucherNumber ? `<VOUCHERNUMBER>${escapeXml(voucher.voucherNumber)}</VOUCHERNUMBER>` : '';
    const ref = voucher.reference ? `<REFERENCE>${escapeXml(voucher.reference)}</REFERENCE>` : '';
    const refDate = voucher.referenceDate ? `<REFERENCEDATE>${toTallyDate(voucher.referenceDate)}</REFERENCEDATE>` : '';
    const narr = voucher.narration ? `<NARRATION>${escapeXml(voucher.narration)}</NARRATION>` : '';

    const ledgerEntriesXML = (voucher.entries || []).map(entry => {
        const isDebit = entry.type === 'Dr';
        const amountVal = Math.abs(parseFloat(entry.amount) || 0);
        // In Tally XML for Accounting Vouchers:
        // Debit amount is negative (-), Credit amount is positive (+)
        const tallyAmount = isDebit ? `-${amountVal.toFixed(2)}` : amountVal.toFixed(2);
        const isPositive = isDebit ? 'Yes' : 'No';

        return `
        <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>${escapeXml(entry.ledgerName)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>${isPositive}</ISDEEMEDPOSITIVE>
            <AMOUNT>${tallyAmount}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>`;
    }).join('');

    return `<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Import Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <IMPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>Vouchers</REPORTNAME>
                <STATICVARIABLES>
                    ${companyName ? `<SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>` : ''}
                </STATICVARIABLES>
            </REQUESTDESC>
            <REQUESTDATA>
                <TALLYMESSAGE xmlns:UDF="TallyUDF">
                    <VOUCHER DATE="${dateStr}" VCHTYPE="${escapeXml(vchType)}" ACTION="Create" OBJVIEW="Accounting Voucher View">
                        <DATE>${dateStr}</DATE>
                        <EFFECTIVEDATE>${dateStr}</EFFECTIVEDATE>
                        <VOUCHERTYPENAME>${escapeXml(vchType)}</VOUCHERTYPENAME>
                        ${vchNo}
                        ${ref}
                        ${refDate}
                        ${narr}
                        ${ledgerEntriesXML}
                    </VOUCHER>
                </TALLYMESSAGE>
            </REQUESTDATA>
        </IMPORTDATA>
    </BODY>
</ENVELOPE>`;
}

/**
 * Build XML to import an Item Invoice (Sales or Purchase) into TallyPrime.
 */
export function buildInvoiceVoucherXML(invoice, companyName) {
    const isSales = invoice.type === 'Sales';
    const vchType = isSales ? 'Sales' : 'Purchase';
    const dateStr = toTallyDate(invoice.date || new Date().toISOString().slice(0, 10));
    const vchNo = invoice.voucherNumber ? `<VOUCHERNUMBER>${escapeXml(invoice.voucherNumber)}</VOUCHERNUMBER>` : '';
    const ref = invoice.reference ? `<REFERENCE>${escapeXml(invoice.reference)}</REFERENCE>` : '';
    const refDate = invoice.referenceDate ? `<REFERENCEDATE>${toTallyDate(invoice.referenceDate)}</REFERENCEDATE>` : '';
    const narr = invoice.narration ? `<NARRATION>${escapeXml(invoice.narration)}</NARRATION>` : '';

    // Calculate items total
    let itemsTotal = 0;
    const inventoryEntriesXML = (invoice.items || []).map(item => {
        const qty = parseFloat(item.qty) || 0;
        const rate = parseFloat(item.rate) || 0;
        const amount = parseFloat(item.amount) || (qty * rate);
        itemsTotal += amount;
        const cleanUnit = (item.unit && item.unit !== '-' && item.unit !== 'None') ? item.unit.trim() : '';

        // For Sales: inventory is credited (ISDEEMEDPOSITIVE = No, amount positive)
        // For Purchase: inventory is debited (ISDEEMEDPOSITIVE = Yes, amount negative)
        const isPositive = isSales ? 'No' : 'Yes';
        const itemAmtFormatted = isSales ? amount.toFixed(2) : `-${amount.toFixed(2)}`;
        const rateStr = cleanUnit ? `${rate.toFixed(2)}/${cleanUnit}` : `${rate.toFixed(2)}`;
        const qtyStr = cleanUnit ? `${qty} ${cleanUnit}` : `${qty}`;

        return `
        <ALLINVENTORYENTRIES.LIST>
            <STOCKITEMNAME>${escapeXml(item.itemName)}</STOCKITEMNAME>
            <ISDEEMEDPOSITIVE>${isPositive}</ISDEEMEDPOSITIVE>
            <RATE>${rateStr}</RATE>
            <ACTUALQTY>${qtyStr}</ACTUALQTY>
            <BILLEDQTY>${qtyStr}</BILLEDQTY>
            <AMOUNT>${itemAmtFormatted}</AMOUNT>
            <ACCOUNTINGALLOCATIONS.LIST>
                <LEDGERNAME>${escapeXml(invoice.accountLedger)}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>${isPositive}</ISDEEMEDPOSITIVE>
                <AMOUNT>${itemAmtFormatted}</AMOUNT>
            </ACCOUNTINGALLOCATIONS.LIST>
        </ALLINVENTORYENTRIES.LIST>`;
    }).join('');

    // Additional Ledgers (Taxes, Freight, Discounts)
    let additionalTotal = 0;
    const additionalLedgersXML = (invoice.additionalLedgers || []).map(add => {
        const amt = parseFloat(add.amount) || 0;
        const isDeduction = add.type === 'Sub';
        const effectiveAmt = isDeduction ? -amt : amt;
        additionalTotal += effectiveAmt;

        let isPositive, formattedAmt;
        if (isSales) {
            isPositive = isDeduction ? 'Yes' : 'No';
            formattedAmt = isDeduction ? `-${amt.toFixed(2)}` : `${amt.toFixed(2)}`;
        } else {
            isPositive = isDeduction ? 'No' : 'Yes';
            formattedAmt = isDeduction ? `${amt.toFixed(2)}` : `-${amt.toFixed(2)}`;
        }

        return `
        <LEDGERENTRIES.LIST>
            <LEDGERNAME>${escapeXml(add.ledgerName)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>${isPositive}</ISDEEMEDPOSITIVE>
            <AMOUNT>${formattedAmt}</AMOUNT>
        </LEDGERENTRIES.LIST>`;
    }).join('');

    // Grand Total of Invoice
    const grandTotal = itemsTotal + additionalTotal;

    // Party Ledger Entry
    // For Sales: Party is Debited with Grand Total (ISDEEMEDPOSITIVE = Yes, amount negative)
    // For Purchase: Party is Credited with Grand Total (ISDEEMEDPOSITIVE = No, amount positive)
    const partyPositive = isSales ? 'Yes' : 'No';
    const partyAmtFormatted = isSales ? `-${grandTotal.toFixed(2)}` : `${grandTotal.toFixed(2)}`;

    const partyLedgerXML = `
    <LEDGERENTRIES.LIST>
        <LEDGERNAME>${escapeXml(invoice.partyLedger)}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>${partyPositive}</ISDEEMEDPOSITIVE>
        <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
        <AMOUNT>${partyAmtFormatted}</AMOUNT>
    </LEDGERENTRIES.LIST>`;

    return `<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Import Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <IMPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>Vouchers</REPORTNAME>
                <STATICVARIABLES>
                    ${companyName ? `<SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>` : ''}
                </STATICVARIABLES>
            </REQUESTDESC>
            <REQUESTDATA>
                <TALLYMESSAGE xmlns:UDF="TallyUDF">
                    <VOUCHER DATE="${dateStr}" VCHTYPE="${escapeXml(vchType)}" ACTION="Create" OBJVIEW="Invoice Voucher View">
                        <DATE>${dateStr}</DATE>
                        <EFFECTIVEDATE>${dateStr}</EFFECTIVEDATE>
                        <VOUCHERTYPENAME>${escapeXml(vchType)}</VOUCHERTYPENAME>
                        <PARTYLEDGERNAME>${escapeXml(invoice.partyLedger)}</PARTYLEDGERNAME>
                        <PARTYNAME>${escapeXml(invoice.partyLedger)}</PARTYNAME>
                        <BASICBASEPARTYNAME>${escapeXml(invoice.partyLedger)}</BASICBASEPARTYNAME>
                        <BASICBUYERNAME>${escapeXml(invoice.partyLedger)}</BASICBUYERNAME>
                        <ISINVOICE>Yes</ISINVOICE>
                        <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
                        ${vchNo}
                        ${ref}
                        ${refDate}
                        ${narr}
                        ${partyLedgerXML}
                        ${additionalLedgersXML}
                        ${inventoryEntriesXML}
                    </VOUCHER>
                </TALLYMESSAGE>
            </REQUESTDATA>
        </IMPORTDATA>
    </BODY>
</ENVELOPE>`;
}

/**
 * Parse Tally's XML Import response.
 */
export function parseTallyImportResponse(xmlResponse) {
    if (!xmlResponse || xmlResponse.trim().length === 0) {
        return { success: false, error: 'Empty response received from Tally' };
    }

    // Extract all LINEERROR messages
    const lineErrors = [...xmlResponse.matchAll(/<LINEERROR[^>]*>([^<]+)<\/LINEERROR>/gi)]
        .map(m => decodeXmlEntities(m[1].trim()))
        .filter(Boolean);

    const createdMatch = xmlResponse.match(/<CREATED[^>]*>([^<]+)<\/CREATED>/i);
    const alteredMatch = xmlResponse.match(/<ALTERED[^>]*>([^<]+)<\/ALTERED>/i);
    const errorsMatch = xmlResponse.match(/<ERRORS[^>]*>([^<]+)<\/ERRORS>/i);

    const created = createdMatch ? parseInt(createdMatch[1], 10) : 0;
    const altered = alteredMatch ? parseInt(alteredMatch[1], 10) : 0;
    const errorCount = errorsMatch ? parseInt(errorsMatch[1], 10) : 0;

    if (lineErrors.length > 0 || (errorCount > 0 && created === 0 && altered === 0)) {
        let joinedError = lineErrors.join(' | ') || `Tally rejected the import (${errorCount} error(s)). Check ledger and balance details.`;

        // Check for specific date missing / educational mode / split error
        if (/voucher date is missing/i.test(joinedError) || /retry Split/i.test(joinedError)) {
            joinedError = `${joinedError}\n\n⚠️ Date Issue Detected:\n1. Tally Educational Mode: Agar Tally Educational version me chal raha hai, toh Tally sirf month ki 1st, 2nd ya 31st (jaise 01-04-2024 ya 01-10-2024) ki date hi accept karta hai. Mid-month date par Tally yeh misleading error deta hai.\n2. Financial Year: Check karein ki date aapki Tally company ke active Financial Year (e.g. 2024-25) ke andar aati ho.`;
        }

        return {
            success: false,
            created,
            altered,
            errors: errorCount || lineErrors.length,
            error: joinedError,
            raw: xmlResponse,
        };
    }

    if (created > 0 || altered > 0) {
        return {
            success: true,
            created,
            altered,
            errors: 0,
            message: `Successfully posted to TallyPrime (${created ? `${created} created` : ''}${altered ? `${altered} altered` : ''}).`,
            raw: xmlResponse,
        };
    }

    // Fallback: check if RESPONSE tag exists without error
    if (xmlResponse.includes('<RESPONSE>') && !xmlResponse.includes('<LINEERROR>')) {
        return { success: true, created: 1, altered: 0, errors: 0, message: 'Voucher posted successfully to TallyPrime.' };
    }

    return {
        success: false,
        error: lineErrors.length > 0 ? lineErrors.join(' | ') : 'Could not confirm voucher creation in TallyPrime response.',
        raw: xmlResponse,
    };
}

/**
 * Post an Accounting Voucher or Item Invoice to TallyPrime via XML-over-HTTP API.
 * @param {Object|string} voucherOrXml - Voucher definition object or pre-built XML string
 * @param {string} companyName - Target open company name in Tally
 * @param {string} tallyUrl - Tally/Proxy endpoint URL
 * @returns {Promise<{ success: boolean, message?: string, error?: string, created?: number }>}
 */
export async function postVoucherToTally(voucherOrXml, companyName, tallyUrl = DEFAULT_TALLY_URL) {
    if (!companyName) {
        throw new Error('Please select an active company in TallyPrime before posting.');
    }

    let xmlPayload = '';
    if (typeof voucherOrXml === 'string') {
        xmlPayload = voucherOrXml;
    } else if (voucherOrXml.mode === 'invoice') {
        xmlPayload = buildInvoiceVoucherXML(voucherOrXml, companyName);
    } else {
        xmlPayload = buildAccountingVoucherXML(voucherOrXml, companyName);
    }

    const responseText = await sendRawRequest(xmlPayload, tallyUrl);
    return parseTallyImportResponse(responseText);
}

