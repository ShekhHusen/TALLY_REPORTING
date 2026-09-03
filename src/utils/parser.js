export function processMaster(json) {
    const messages = Array.isArray(json.tallymessage) ? json.tallymessage : (json.tallymessage ? [json.tallymessage] : []);
    return messages
        .filter(m => m.metadata && m.metadata.type === 'Ledger')
        .map(m => {
            const name = m.metadata.name || '';
            const group = m.parent || '';
            
            let ob = parseFloat(m.openingbalance || '0');
            let obType = ob < 0 ? 'Dr' : (ob > 0 ? 'Cr' : '');
            let obAmount = Math.abs(ob);

            let address = '';
            if (m.ledmailingdetails && m.ledmailingdetails[0] && m.ledmailingdetails[0].address) {
                const addrData = m.ledmailingdetails[0].address;
                if (Array.isArray(addrData)) {
                    address = addrData.filter(a => typeof a === 'string').join(', ');
                } else if (typeof addrData === 'string') {
                    address = addrData;
                }
            } else if (m.oldaddress) {
                const oldAddr = m.oldaddress;
                if (Array.isArray(oldAddr)) {
                    address = oldAddr.filter(a => typeof a === 'string').join(', ');
                } else if (typeof oldAddr === 'string') {
                    address = oldAddr;
                }
            }

            let contact = m.ledgercontact || '';
            if (!contact && m.contactdetails && m.contactdetails[0]) {
                contact = m.contactdetails[0].name || '';
            }

            return {
                id: m.guid || crypto.randomUUID(),
                name,
                group,
                openingBalance: obAmount,
                openingBalanceType: obType,
                address,
                contact
            };
        });
}

export function processTransactions(json) {
    const messages = Array.isArray(json.tallymessage) ? json.tallymessage : (json.tallymessage ? [json.tallymessage] : []);
    return messages
        .filter(m => m.metadata && m.metadata.type === 'Voucher' && !m.iscancelled && !m.isdeleted)
        .map(m => {
            const date = m.date || '';
            const formattedDate = date ? `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}` : '';
            const type = m.vouchertypename || '';
            const voucherNo = m.vouchernumber || '';
            const narration = m.narration || '';
            const enteredBy = m.enteredby || '';
            
            let debitAccounts = [];
            let creditAccounts = [];
            let inventory = [];
            
            const processEntry = (entry) => {
                if(!entry) return;
                const amtStr = entry.amount || "0";
                const amt = parseFloat(amtStr);
                if(amt === 0) return;
                
                const isDebit = entry.isdeemedpositive === true || (entry.isdeemedpositive !== false && amt < 0);
                const absAmt = Math.abs(amt);
                const ledgerName = entry.ledgername || '';
                
                if (isDebit) debitAccounts.push({ name: ledgerName, amount: absAmt });
                else creditAccounts.push({ name: ledgerName, amount: absAmt });
            };
            
            const toArray = (val) => Array.isArray(val) ? val : (val ? [val] : []);
            
            const inventoryEntries = toArray(m.allinventoryentries);
            if (inventoryEntries.length > 0) {
                inventoryEntries.forEach(inv => {
                    let qty = inv.actualqty || inv.billedqty || '';
                    inventory.push({
                        itemName: inv.stockitemname || '',
                        qty: qty,
                        rate: inv.rate || '',
                        amount: Math.abs(parseFloat(inv.amount || '0'))
                    });
                    
                    const allocations = toArray(inv.accountingallocations);
                    allocations.forEach(processEntry);
                });
            }
            
            const allLedgers = toArray(m.allledgerentries);
            allLedgers.forEach(processEntry);
            
            const ledgers = toArray(m.ledgerentries);
            ledgers.forEach(processEntry);
            
            // Sort by amount descending for primary account display
            debitAccounts.sort((a, b) => b.amount - a.amount);
            creditAccounts.sort((a, b) => b.amount - a.amount);

            const primaryDebit = debitAccounts.length > 0 ? debitAccounts[0].name : '-';
            const totalDebit = debitAccounts.reduce((acc, curr) => acc + curr.amount, 0);
            
            const primaryCredit = creditAccounts.length > 0 ? creditAccounts[0].name : '-';
            const totalCredit = creditAccounts.reduce((acc, curr) => acc + curr.amount, 0);

            // Collect all unique account names for filtering & affected account processing
            const allDebitAccountNames = [...new Set(debitAccounts.map(a => a.name).filter(n => n))];
            const allCreditAccountNames = [...new Set(creditAccounts.map(a => a.name).filter(n => n))];

            return {
                id: m.guid || crypto.randomUUID(),
                date: formattedDate,
                type,
                voucherNo,
                debitAccount: primaryDebit,
                debitAmount: totalDebit,
                creditAccount: primaryCredit,
                creditAmount: totalCredit,
                // All individual entries for accurate per-account balance calculation
                allDebitEntries: debitAccounts,   // [{ name, amount }, ...]
                allCreditEntries: creditAccounts, // [{ name, amount }, ...]
                // Unique account names for easy filtering
                allDebitAccounts: allDebitAccountNames,
                allCreditAccounts: allCreditAccountNames,
                inventory,
                narration,
                enteredBy
            };
        });
}

