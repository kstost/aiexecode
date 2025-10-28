clear
rm -rf ~/.aiexe/debuglog/
echo -n '---
1234
5678
9012
5634
' > /home/ubuntu/aiexecode/test_viewer.txt
echo '
{
    "file_path": "/home/ubuntu/aiexecode/test_viewer.txt",
    "old_string": "1234\n56",
    "new_string": "ABCD"
}
' | node test_viewer.js
cat ~/.aiexe/debuglog/ui_components.log | cut -b 45-

