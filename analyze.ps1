$content = [System.IO.File]::ReadAllText("c:\Users\dell\Documents\GitHub\TALLY_REPORTING\Transactions.json", [System.Text.Encoding]::Unicode)
$json = $content | ConvertFrom-Json

Write-Host "=== VOUCHER TYPE DISTRIBUTION ==="
$groups = $json.tallymessage | ForEach-Object { $_.metadata.vchtype } | Group-Object | Sort-Object Count -Descending
foreach ($g in $groups) {
    Write-Host ("  {0}: {1}" -f $g.Name, $g.Count)
}

Write-Host "`n=== TOTAL TRANSACTIONS ==="
Write-Host ("Total messages: " + $json.tallymessage.Count)

Write-Host "`n=== SAMPLE JOURNAL VOUCHER (first 2 found) ==="
$journals = $json.tallymessage | Where-Object { $_.metadata.vchtype -eq "Journal" -and -not $_.iscancelled -and -not $_.isdeleted } | Select-Object -First 2
if ($journals) {
    foreach ($j in $journals) {
        Write-Host "`n--- Journal Voucher ---"
        Write-Host ("Date: " + $j.date)
        Write-Host ("VoucherNo: " + $j.vouchernumber)
        Write-Host ("GUID: " + $j.guid)
        Write-Host ("Narration: " + $j.narration)
        Write-Host ("EnteredBy: " + $j.enteredby)
        
        Write-Host "`nallledgerentries:"
        if ($j.allledgerentries) {
            $entries = if ($j.allledgerentries -is [array]) { $j.allledgerentries } else { @($j.allledgerentries) }
            foreach ($e in $entries) {
                Write-Host ("  Ledger: {0}, Amount: {1}, isDeemedPositive: {2}" -f $e.ledgername, $e.amount, $e.isdeemedpositive)
            }
        } else {
            Write-Host "  (none)"
        }
        
        Write-Host "`nledgerentries:"
        if ($j.ledgerentries) {
            $entries = if ($j.ledgerentries -is [array]) { $j.ledgerentries } else { @($j.ledgerentries) }
            foreach ($e in $entries) {
                Write-Host ("  Ledger: {0}, Amount: {1}, isDeemedPositive: {2}" -f $e.ledgername, $e.amount, $e.isdeemedpositive)
            }
        } else {
            Write-Host "  (none)"
        }
        
        Write-Host "`nallinventoryentries:"
        if ($j.allinventoryentries) {
            $entries = if ($j.allinventoryentries -is [array]) { $j.allinventoryentries } else { @($j.allinventoryentries) }
            foreach ($e in $entries) {
                Write-Host ("  Stock: {0}, Qty: {1}, Rate: {2}, Amount: {3}" -f $e.stockitemname, $e.actualqty, $e.rate, $e.amount)
            }
        } else {
            Write-Host "  (none)"
        }
        
        Write-Host "`n--- Full JSON (truncated) ---"
        $jjson = $j | ConvertTo-Json -Depth 5
        if ($jjson.Length -gt 3000) {
            Write-Host $jjson.Substring(0, 3000)
            Write-Host "... (truncated)"
        } else {
            Write-Host $jjson
        }
    }
} else {
    Write-Host "No non-cancelled Journal voucher found"
}

# Also check for multi-ledger entries (more than 2 ledger entries)
Write-Host "`n=== MULTI-LEDGER JOURNAL VOUCHERS ==="
$multiLedger = $json.tallymessage | Where-Object { 
    $_.metadata.vchtype -eq "Journal" -and -not $_.iscancelled -and -not $_.isdeleted -and
    $_.allledgerentries -and ($_.allledgerentries -is [array]) -and ($_.allledgerentries.Count -gt 2)
} | Select-Object -First 2
if ($multiLedger) {
    foreach ($j in $multiLedger) {
        Write-Host ("`n--- Multi-Ledger Journal (VNo: {0}, Date: {1}) ---" -f $j.vouchernumber, $j.date)
        $entries = $j.allledgerentries
        foreach ($e in $entries) {
            Write-Host ("  Ledger: {0}, Amount: {1}, isDeemedPositive: {2}" -f $e.ledgername, $e.amount, $e.isdeemedpositive)
        }
    }
} else {
    Write-Host "No multi-ledger journal vouchers found"
}
