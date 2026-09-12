const fs = require('fs');
const content = fs.readFileSync('src/components/FollowUpModal.jsx', 'utf-8');

let updated = content.replace('const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);', 'const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);\n  const [updateModalTab, setUpdateModalTab] = useState(\'update\');');

updated = updated.replace(/const handleOpenUpdate = \(fu\) => \{\n\s*setSelectedFollowUp\(fu\);\n\s*setIsUpdateModalOpen\(true\);\n\s*\};/g, `const handleOpenUpdate = (fu, tab = 'update') => {
    setSelectedFollowUp(fu);
    setUpdateModalTab(tab);
    setIsUpdateModalOpen(true);
  };`);

updated = updated.replace(/<UpdateFollowUpModal\n\s*isOpen={isUpdateModalOpen}/g, `<UpdateFollowUpModal
        isOpen={isUpdateModalOpen}
        initialTab={updateModalTab}`);
        
updated = updated.replace(/<button\n\s*type="button"\n\s*onClick=\{\(\) => handleOpenUpdate\(f\)\}\n\s*className=\{\`px-3 py-1.5 bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 rounded-lg font-bold transition-colors inline-flex items-center justify-center gap-1.5 \$\{f\.completed \? 'w-full py-2.5' : ''\}\`\}/g, `<button
                            type="button"
                            onClick={() => handleOpenUpdate(f, 'history')}
                            className={\`px-3 py-1.5 bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 rounded-lg font-bold transition-colors inline-flex items-center justify-center gap-1.5 \${f.completed ? 'w-full py-2.5' : ''}\`}`);

fs.writeFileSync('src/components/FollowUpModal.jsx', updated);
console.log("Success");
