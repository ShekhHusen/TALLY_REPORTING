const fs = require('fs');
const content = fs.readFileSync('src/components/FollowUpsTab.jsx', 'utf-8');

let updated = content.replace('const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);', 'const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);\n  const [updateModalTab, setUpdateModalTab] = useState(\'update\');');

updated = updated.replace(/const handleOpenUpdate = \(fu\) => \{\n\s*setSelectedFollowUp\(fu\);\n\s*setIsUpdateModalOpen\(true\);\n\s*\};/g, `const handleOpenUpdate = (fu, tab = 'update') => {
    setSelectedFollowUp(fu);
    setUpdateModalTab(tab);
    setIsUpdateModalOpen(true);
  };`);

updated = updated.replace(/<UpdateFollowUpModal\n\s*isOpen={isUpdateModalOpen}/g, `<UpdateFollowUpModal
        isOpen={isUpdateModalOpen}
        initialTab={updateModalTab}`);
        
updated = updated.replace(/onClick=\{\(\) => \{ setActiveDropdown\(null\); handleOpenUpdate\(fu\); \}\}/g, `onClick={() => { setActiveDropdown(null); handleOpenUpdate(fu, 'history'); }}`);

fs.writeFileSync('src/components/FollowUpsTab.jsx', updated);
console.log("Success");
