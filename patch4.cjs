const fs = require('fs');
const content = fs.readFileSync('src/components/FollowUpsTab.jsx', 'utf-8');

let updated = content.replace(/onClick=\{\(\) => handleOpenUpdate\(fu\)\}\n\s*className="[^"]*"\n\s*title="History"/g, `onClick={() => handleOpenUpdate(fu, 'history')}
                            className="py-1.5 px-1 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-lg text-[10px] font-bold transition-colors flex flex-col sm:flex-row items-center justify-center gap-1 shadow-sm truncate"
                            title="History"`);
                            
updated = updated.replace(/onClick=\{\(\) => handleOpenUpdate\(fu\)\}\n\s*className="[^"]*"\n\s*title="History"/g, `onClick={() => handleOpenUpdate(fu, 'history')}
                            className="py-1.5 px-1 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-lg text-[10px] font-bold transition-colors flex flex-col sm:flex-row items-center justify-center gap-1 shadow-sm truncate"
                            title="History"`);

fs.writeFileSync('src/components/FollowUpsTab.jsx', updated);
console.log("Success");
